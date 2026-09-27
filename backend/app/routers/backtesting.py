import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.backtest import BacktestRun
from app.services import snapshot_service
from app.services.backtest_engine import run_backtest
from app.services.mock_data import generate_ohlcv
from app.services.event_log import log_event
from app.services.strategy_scorer import score_strategy, compare_strategies
from app.services.walk_forward import run_walk_forward
from app.services.param_optimizer import optimize_parameters

router = APIRouter(prefix="/api/backtest", tags=["backtesting"])


class ExecuteRequest(BaseModel):
    strategy_id: int | None = None
    code: str = ""
    symbols: list[str] = []
    start_date: str = ""
    end_date: str = ""
    initial_capital: float = 100000
    stop_loss_pct: float = 5.0
    target_pct: float = 10.0
    max_positions: int = 10
    trailing_stop_pct: float = 0.0
    slippage_bps: float = 5.0
    commission_pct: float = 0.03


@router.post("/execute")
async def execute_backtest(req: ExecuteRequest, db: AsyncSession = Depends(get_db)):
    if not req.code:
        return {"error": "Strategy code is required"}
    if not req.symbols:
        return {"error": "At least one symbol is required"}

    symbols = [s.upper() for s in req.symbols[:50]]
    candles_by_symbol: dict[str, list[dict]] = {}
    for sym in symbols:
        stored = await snapshot_service.get_stored_candles(db, sym)
        if stored:
            candles_by_symbol[sym] = stored
        else:
            candles_by_symbol[sym] = generate_ohlcv(sym, days=365, interval="day")

    log_event(f"Running backtest on {len(symbols)} symbols", source="backtest", level="info")

    try:
        result = run_backtest(
            code=req.code,
            symbols=symbols,
            candles_by_symbol=candles_by_symbol,
            initial_capital=req.initial_capital,
            stop_loss_pct=req.stop_loss_pct,
            target_pct=req.target_pct,
            max_positions=req.max_positions,
            trailing_stop_pct=req.trailing_stop_pct,
            slippage_bps=req.slippage_bps,
            commission_pct=req.commission_pct,
        )
    except ValueError as e:
        return {"error": str(e)}

    run = BacktestRun(
        strategy_id=req.strategy_id or 0,
        start_date=req.start_date or (result.equity_curve[0]["date"] if result.equity_curve else ""),
        end_date=req.end_date or (result.equity_curve[-1]["date"] if result.equity_curve else ""),
        initial_capital=req.initial_capital,
        total_return=result.metrics.get("total_return_pct", 0),
        win_rate=result.metrics.get("win_rate", 0),
        avg_win_loss=result.metrics.get("avg_win_loss_ratio", 0),
        max_drawdown=result.metrics.get("max_drawdown", 0),
        sharpe_ratio=result.metrics.get("sharpe_ratio", 0),
        total_trades=result.metrics.get("total_trades", 0),
        trade_log=json.dumps(result.trades),
        equity_curve=json.dumps(result.equity_curve),
        profit_factor=result.metrics.get("profit_factor", 0),
        sortino_ratio=result.metrics.get("sortino_ratio", 0),
        calmar_ratio=result.metrics.get("calmar_ratio", 0),
        max_drawdown_duration=result.metrics.get("max_drawdown_duration", 0),
        winning_trades=result.metrics.get("winning_trades", 0),
        losing_trades=result.metrics.get("losing_trades", 0),
        expectancy=result.metrics.get("expectancy", 0),
        strategy_code=req.code,
        symbols=json.dumps(symbols),
        status="completed",
        signals_log=json.dumps(result.signals_by_date),
        benchmark_curve=json.dumps(result.benchmark_curve),
        drawdown_curve=json.dumps(result.drawdown_curve),
        monthly_returns=json.dumps(result.monthly_returns),
        metrics_json=json.dumps(result.metrics),
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    log_event(
        f"Backtest completed: {result.metrics.get('total_trades', 0)} trades, "
        f"{result.metrics.get('total_return_pct', 0):.1f}% return",
        source="backtest", level="info",
    )

    return {
        "id": run.id,
        "metrics": result.metrics,
        "trades": result.trades,
        "equity_curve": result.equity_curve,
        "benchmark_curve": result.benchmark_curve,
        "drawdown_curve": result.drawdown_curve,
        "monthly_returns": result.monthly_returns,
        "signals_by_date": result.signals_by_date,
    }


@router.get("/runs")
async def list_runs(
    strategy_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(BacktestRun).order_by(BacktestRun.created_at.desc())
    if strategy_id is not None:
        q = q.where(BacktestRun.strategy_id == strategy_id)
    result = await db.execute(q.limit(50))
    runs = result.scalars().all()
    return [
        {
            "id": r.id,
            "strategy_id": r.strategy_id,
            "start_date": r.start_date,
            "end_date": r.end_date,
            "initial_capital": r.initial_capital,
            "total_return": r.total_return,
            "win_rate": r.win_rate,
            "max_drawdown": r.max_drawdown,
            "sharpe_ratio": r.sharpe_ratio,
            "total_trades": r.total_trades,
            "profit_factor": r.profit_factor,
            "sortino_ratio": r.sortino_ratio,
            "status": r.status,
            "symbols": json.loads(r.symbols or "[]"),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in runs
    ]


@router.get("/runs/{run_id}")
async def get_run(run_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BacktestRun).where(BacktestRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        return {"error": "Run not found"}
    # Prefer full metrics_json if available, fall back to individual columns
    stored_metrics = json.loads(run.metrics_json or "{}") if run.metrics_json else {}
    if not stored_metrics:
        stored_metrics = {
            "initial_capital": run.initial_capital,
            "total_return_pct": run.total_return,
            "win_rate": run.win_rate,
            "avg_win_loss_ratio": run.avg_win_loss,
            "max_drawdown": run.max_drawdown,
            "sharpe_ratio": run.sharpe_ratio,
            "total_trades": run.total_trades,
            "profit_factor": run.profit_factor,
            "sortino_ratio": run.sortino_ratio,
            "calmar_ratio": run.calmar_ratio,
            "max_drawdown_duration": run.max_drawdown_duration,
            "winning_trades": run.winning_trades,
            "losing_trades": run.losing_trades,
            "expectancy": run.expectancy,
        }

    return {
        "id": run.id,
        "strategy_id": run.strategy_id,
        "start_date": run.start_date,
        "end_date": run.end_date,
        "initial_capital": run.initial_capital,
        "status": run.status,
        "symbols": json.loads(run.symbols or "[]"),
        "strategy_code": run.strategy_code,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "metrics": stored_metrics,
        "trades": json.loads(run.trade_log or "[]"),
        "equity_curve": json.loads(run.equity_curve or "[]"),
        "benchmark_curve": json.loads(run.benchmark_curve or "[]") if run.benchmark_curve else [],
        "drawdown_curve": json.loads(run.drawdown_curve or "[]") if run.drawdown_curve else [],
        "monthly_returns": json.loads(run.monthly_returns or "[]") if run.monthly_returns else [],
        "signals_by_date": json.loads(run.signals_log or "{}"),
    }


@router.delete("/runs/{run_id}")
async def delete_run(run_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(BacktestRun).where(BacktestRun.id == run_id))
    await db.commit()
    return {"deleted": run_id}


@router.post("/score/{run_id}")
async def score_run(run_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BacktestRun).where(BacktestRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        return {"error": "Run not found"}
    metrics = {
        "total_return_pct": run.total_return,
        "win_rate": run.win_rate,
        "profit_factor": run.profit_factor,
        "sharpe_ratio": run.sharpe_ratio,
        "sortino_ratio": run.sortino_ratio,
        "max_drawdown_pct": run.max_drawdown,
        "expectancy": run.expectancy,
        "total_trades": run.total_trades,
    }
    return score_strategy(metrics)


class CompareRunsRequest(BaseModel):
    run_ids: list[int]


@router.post("/compare")
async def compare_runs(req: CompareRunsRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BacktestRun).where(BacktestRun.id.in_(req.run_ids))
    )
    db_runs = result.scalars().all()
    runs = []
    for r in db_runs:
        runs.append({
            "id": r.id,
            "strategy_name": f"Run #{r.id}",
            "metrics": {
                "initial_capital": r.initial_capital,
                "total_return_pct": r.total_return,
                "win_rate": r.win_rate,
                "profit_factor": r.profit_factor,
                "sharpe_ratio": r.sharpe_ratio,
                "sortino_ratio": r.sortino_ratio,
                "max_drawdown_pct": r.max_drawdown,
                "max_drawdown_duration": r.max_drawdown_duration,
                "expectancy": r.expectancy,
                "total_trades": r.total_trades,
                "winning_trades": r.winning_trades,
                "losing_trades": r.losing_trades,
                "calmar_ratio": r.calmar_ratio,
            },
        })
    return compare_strategies(runs)


class WalkForwardRequest(BaseModel):
    code: str
    symbols: list[str]
    n_windows: int = 4
    is_ratio: float = 0.7
    initial_capital: float = 100000
    stop_loss_pct: float = 5.0
    target_pct: float = 10.0
    max_positions: int = 10


@router.post("/walk-forward")
async def walk_forward(req: WalkForwardRequest, db: AsyncSession = Depends(get_db)):
    if not req.code or not req.symbols:
        return {"error": "Code and symbols required"}

    symbols = [s.upper() for s in req.symbols[:50]]
    candles_by_symbol: dict[str, list[dict]] = {}
    for sym in symbols:
        stored = await snapshot_service.get_stored_candles(db, sym)
        if stored:
            candles_by_symbol[sym] = stored
        else:
            candles_by_symbol[sym] = generate_ohlcv(sym, days=365, interval="day")

    log_event(f"Walk-forward test: {req.n_windows} windows on {len(symbols)} symbols", source="backtest", level="info")

    result = run_walk_forward(
        code=req.code,
        symbols=symbols,
        candles_by_symbol=candles_by_symbol,
        n_windows=req.n_windows,
        is_ratio=req.is_ratio,
        initial_capital=req.initial_capital,
        stop_loss_pct=req.stop_loss_pct,
        target_pct=req.target_pct,
        max_positions=req.max_positions,
    )
    return result


class OptimizeRequest(BaseModel):
    code: str
    symbols: list[str]
    param_ranges: dict[str, list]
    initial_capital: float = 100000
    stop_loss_pct: float = 5.0
    target_pct: float = 10.0
    max_positions: int = 10
    optimize_metric: str = "sharpe_ratio"


@router.post("/optimize")
async def optimize(req: OptimizeRequest, db: AsyncSession = Depends(get_db)):
    if not req.code or not req.symbols:
        return {"error": "Code and symbols required"}

    symbols = [s.upper() for s in req.symbols[:50]]
    candles_by_symbol: dict[str, list[dict]] = {}
    for sym in symbols:
        stored = await snapshot_service.get_stored_candles(db, sym)
        if stored:
            candles_by_symbol[sym] = stored
        else:
            candles_by_symbol[sym] = generate_ohlcv(sym, days=365, interval="day")

    log_event(f"Parameter optimization: {len(req.param_ranges)} params on {len(symbols)} symbols", source="backtest", level="info")

    result = optimize_parameters(
        code=req.code,
        symbols=symbols,
        candles_by_symbol=candles_by_symbol,
        param_ranges=req.param_ranges,
        initial_capital=req.initial_capital,
        stop_loss_pct=req.stop_loss_pct,
        target_pct=req.target_pct,
        max_positions=req.max_positions,
        optimize_metric=req.optimize_metric,
    )
    return result
