import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.analyzer import AnalyzerStock
from app.services import snapshot_service
from app.services.indicators import compute_indicators
from app.services.mock_data import generate_ohlcv
from app.services.strategy_runner import run_analyzer_strategy, scan_code_trade_markers
from app.services.event_log import log_event
from app.services.market_context import market_context, stock_context
from app.services.visual_strategy_runner import run_visual_strategy, scan_visual_trade_markers
from app.services.strategy_templates import get_templates, get_template
from app.services.signal_generator import generate_current_signal
from app.services.candle_utils import prepare_candles

router = APIRouter(prefix="/api/analyzer", tags=["analyzer"])


class AddStocksRequest(BaseModel):
    stocks: list[dict]
    strategy_name: str = ""
    strategy_type: str = "manual"
    index_filter: str = "NIFTY500"
    sector_filter: str = "All"
    folder_id: int | None = None


@router.post("/stocks")
async def add_stocks(req: AddStocksRequest, db: AsyncSession = Depends(get_db)):
    run_id = uuid.uuid4().hex[:12]
    rows = []
    for s in req.stocks:
        row = AnalyzerStock(
            symbol=s.get("symbol", ""),
            name=s.get("name", ""),
            price=s.get("price", 0.0),
            matched_criteria=s.get("matched_criteria", ""),
            strategy_name=req.strategy_name,
            strategy_type=req.strategy_type,
            index_filter=req.index_filter,
            sector_filter=req.sector_filter,
            run_id=run_id,
            folder_id=req.folder_id,
        )
        db.add(row)
        rows.append(row)
    await db.commit()
    return {"added": len(rows), "run_id": run_id}


@router.get("/stocks")
async def list_stocks(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AnalyzerStock).order_by(AnalyzerStock.created_at.desc())
    )
    stocks = result.scalars().all()
    return [
        {
            "id": s.id,
            "symbol": s.symbol,
            "name": s.name,
            "price": s.price,
            "matched_criteria": s.matched_criteria,
            "strategy_name": s.strategy_name,
            "strategy_type": s.strategy_type,
            "index_filter": s.index_filter,
            "sector_filter": s.sector_filter,
            "run_id": s.run_id,
            "folder_id": s.folder_id,
            "position": s.position,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in stocks
    ]


@router.delete("/stocks/{stock_id}")
async def remove_stock(stock_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(AnalyzerStock).where(AnalyzerStock.id == stock_id))
    await db.commit()
    return {"deleted": stock_id}


@router.delete("/stocks/run/{run_id}")
async def remove_run(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        delete(AnalyzerStock).where(AnalyzerStock.run_id == run_id)
    )
    await db.commit()
    return {"deleted": result.rowcount, "run_id": run_id}


async def _get_scorecard(db: AsyncSession, symbol: str) -> dict:
    candles = await snapshot_service.get_stored_candles(db, symbol)
    source = "live"
    if not candles:
        candles = generate_ohlcv(symbol, days=280, interval="day")
        source = "mock"
    vals = compute_indicators(candles)

    def pick(keys: list[str]) -> dict:
        return {k: round(v, 2) if isinstance(v, float) else v for k in keys if (v := vals.get(k)) is not None}

    return {
        "symbol": symbol,
        "source": source,
        "trend": pick([
            "sma_20", "sma_50", "sma_200",
            "price_vs_sma20", "price_vs_sma50", "price_vs_sma200",
            "ema_9", "ema_20", "sma20_vs_sma50", "sma50_vs_sma200",
            "consecutive_up_days", "consecutive_down_days",
        ]),
        "momentum": pick([
            "rsi_7", "rsi_14", "rsi_21",
            "macd", "macd_above_zero",
        ]),
        "volatility": pick([
            "atr_14", "atr_20", "atr_percentage",
            "historical_volatility_5d", "historical_volatility_20d",
            "historical_volatility_60d",
        ]),
        "volume": pick([
            "volume_1d", "volume_5d_avg", "volume_20d_avg",
            "volume_ratio_5d", "volume_ratio_20d", "rvol",
        ]),
        "price_action": pick([
            "distance_from_20d_high", "distance_from_50d_high",
            "distance_from_52w_high", "breakout_20d", "breakout_52w",
            "close_position", "body_size",
            "drawdown_from_20d_high", "drawdown_from_50d_high",
        ]),
        "returns": pick([
            "return_1d", "return_3d", "return_5d", "return_10d",
            "return_20d", "return_60d", "return_120d", "return_252d",
        ]),
    }


@router.get("/{symbol}/scorecard")
async def get_scorecard(symbol: str, db: AsyncSession = Depends(get_db)):
    return await _get_scorecard(db, symbol.upper())


class AnalyzerCodeRunRequest(BaseModel):
    code: str
    symbols: list[str]
    date_from: str | None = None
    date_to: str | None = None
    interval: str = "day"
    initial_capital: float = 100000
    max_trades_per_day: int = 5
    position_size_pct: float = 10


async def _fetch_candles(
    db, symbols: list[str], date_from: str | None, date_to: str | None, interval: str
) -> dict[str, list[dict]]:
    candles_by_symbol: dict[str, list[dict]] = {}
    for sym in symbols[:50]:
        stored = await snapshot_service.get_stored_candles(db, sym.upper())
        if stored:
            raw = stored
        else:
            days = 280
            if date_from and date_to:
                from datetime import date as dt_date
                delta = (dt_date.fromisoformat(date_to) - dt_date.fromisoformat(date_from)).days
                days = max(delta + 60, 280)
            raw = generate_ohlcv(sym.upper(), days=days, interval="day")
        candles_by_symbol[sym.upper()] = prepare_candles(raw, date_from, date_to, interval)
    return candles_by_symbol


@router.post("/run/code")
async def run_analyzer_code(req: AnalyzerCodeRunRequest, db: AsyncSession = Depends(get_db)):
    candles_by_symbol = await _fetch_candles(
        db, req.symbols, req.date_from, req.date_to, req.interval
    )
    trading_params = {
        "initial_capital": req.initial_capital,
        "max_trades_per_day": req.max_trades_per_day,
        "position_size_pct": req.position_size_pct,
        "interval": req.interval,
        "date_from": req.date_from,
        "date_to": req.date_to,
    }
    log_event(
        f"Running analyzer strategy on {len(req.symbols)} symbols "
        f"({req.interval}, {req.date_from}→{req.date_to}, ₹{req.initial_capital})",
        source="analyzer", level="info",
    )
    try:
        results = run_analyzer_strategy(
            req.code, [s.upper() for s in req.symbols], candles_by_symbol, trading_params
        )
    except ValueError as e:
        return {"error": str(e)}
    trade_markers: dict[str, list[dict]] = {}
    for sym in [s.upper() for s in req.symbols]:
        candles = candles_by_symbol.get(sym, [])
        if candles:
            markers = scan_code_trade_markers(req.code, sym, candles, trading_params)
            if markers:
                trade_markers[sym] = markers
    log_event(f"Analyzer strategy returned {len(results)} signals", source="analyzer", level="info")
    return {"signals": results, "trade_markers": trade_markers}


@router.get("/{symbol}/context")
async def get_context(symbol: str, db: AsyncSession = Depends(get_db)):
    mkt = await market_context(db)
    stk = await stock_context(db, symbol.upper())
    return {"market": mkt, "stock": stk}


class VisualRunRequest(BaseModel):
    conditions: dict
    symbols: list[str]
    date_from: str | None = None
    date_to: str | None = None
    interval: str = "day"
    initial_capital: float = 100000
    max_trades_per_day: int = 5
    position_size_pct: float = 10


@router.post("/run/visual")
async def run_visual(req: VisualRunRequest, db: AsyncSession = Depends(get_db)):
    candles_by_symbol = await _fetch_candles(
        db, req.symbols, req.date_from, req.date_to, req.interval
    )
    trading_params = {
        "initial_capital": req.initial_capital,
        "max_trades_per_day": req.max_trades_per_day,
        "position_size_pct": req.position_size_pct,
        "interval": req.interval,
        "date_from": req.date_from,
        "date_to": req.date_to,
    }
    log_event(
        f"Running visual strategy on {len(req.symbols)} symbols "
        f"({req.interval}, {req.date_from}→{req.date_to}, ₹{req.initial_capital})",
        source="analyzer", level="info",
    )
    results = run_visual_strategy(
        req.conditions, [s.upper() for s in req.symbols], candles_by_symbol, trading_params
    )
    trade_markers: dict[str, list[dict]] = {}
    for sym in [s.upper() for s in req.symbols]:
        candles = candles_by_symbol.get(sym, [])
        if candles:
            markers = scan_visual_trade_markers(req.conditions, sym, candles)
            if markers:
                trade_markers[sym] = markers
    log_event(f"Visual strategy returned {len(results)} signals", source="analyzer", level="info")
    return {"signals": results, "trade_markers": trade_markers}


@router.get("/templates")
async def list_templates():
    return get_templates()


@router.get("/templates/{template_id}")
async def get_template_by_id(template_id: str):
    t = get_template(template_id)
    if not t:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Template not found")
    return t


class SignalRequest(BaseModel):
    code: str
    symbol: str


@router.post("/signal")
async def get_signal(req: SignalRequest, db: AsyncSession = Depends(get_db)):
    sym = req.symbol.upper()
    candles = await snapshot_service.get_stored_candles(db, sym)
    if not candles:
        candles = generate_ohlcv(sym, days=280, interval="day")
    return generate_current_signal(sym, req.code, candles)


class CompareRequest(BaseModel):
    symbols: list[str]


@router.post("/compare")
async def compare_stocks(req: CompareRequest, db: AsyncSession = Depends(get_db)):
    result = {}
    for sym in req.symbols[:20]:
        result[sym.upper()] = await _get_scorecard(db, sym.upper())
    return result
