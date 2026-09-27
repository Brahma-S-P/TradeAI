import asyncio

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select, func

from app.core.database import get_db, async_session
from app.models.snapshot import DailyCandleStore, IntradayCandle
from app.services import snapshot_service
from app.services.kite_service import kite_service

router = APIRouter(prefix="/api/snapshot", tags=["snapshot"])

_running = {"active": False, "current_symbol": ""}


class RunRequest(BaseModel):
    index: str = "NIFTY500"


def _on_progress(symbol: str):
    _running["current_symbol"] = symbol


async def _run_job(index: str):
    _running["active"] = True
    _running["current_symbol"] = ""
    try:
        async with async_session() as db:
            await snapshot_service.run_snapshot(db, index=index, on_progress=_on_progress)
    finally:
        _running["active"] = False
        _running["current_symbol"] = ""


async def _history_job():
    _running["active"] = True
    _running["current_symbol"] = ""
    try:
        async with async_session() as db:
            await snapshot_service.run_full_history(db, on_progress=_on_progress)
    finally:
        _running["active"] = False
        _running["current_symbol"] = ""


async def _topup_job():
    _running["active"] = True
    _running["current_symbol"] = ""
    try:
        async with async_session() as db:
            await snapshot_service.run_topup(db, on_progress=_on_progress)
    finally:
        _running["active"] = False
        _running["current_symbol"] = ""


@router.get("/status")
async def status(db: AsyncSession = Depends(get_db)):
    run = await snapshot_service.latest_run(db)
    stored = (await db.execute(select(func.count()).select_from(DailyCandleStore))).scalar() or 0
    intraday_count = (await db.execute(
        select(func.count(IntradayCandle.id.distinct())).select_from(IntradayCandle)
    )).scalar() or 0
    return {
        "has_today": await snapshot_service.has_snapshot(db),
        "running": _running["active"],
        "current_symbol": _running.get("current_symbol", ""),
        "kite_connected": kite_service.is_connected,
        "history_loaded": stored > 0,
        "stored_symbols": stored,
        "intraday_candles": intraday_count,
        "last_run": None if not run else {
            "date": str(run.snapshot_date),
            "status": run.status,
            "source": run.source,
            "universe": run.universe,
            "processed": run.stocks_processed,
            "total": run.stocks_total,
            "finished_at": str(run.finished_at) if run.finished_at else None,
        },
    }


@router.get("/data-summary")
async def data_summary(db: AsyncSession = Depends(get_db)):
    import json
    total = (await db.execute(select(func.count()).select_from(DailyCandleStore))).scalar() or 0
    if total == 0:
        return {"total_symbols": 0, "symbols": []}

    res = await db.execute(
        select(DailyCandleStore.symbol, DailyCandleStore.candles, DailyCandleStore.updated_at)
        .order_by(DailyCandleStore.symbol)
    )
    rows = res.all()
    symbols = []
    for sym, raw, updated in rows:
        try:
            candles = json.loads(raw) if raw else []
        except Exception:
            candles = []
        if candles:
            symbols.append({
                "symbol": sym,
                "candle_count": len(candles),
                "first_date": candles[0].get("date", ""),
                "last_date": candles[-1].get("date", ""),
                "last_close": candles[-1].get("close"),
                "updated_at": str(updated) if updated else None,
            })
        else:
            symbols.append({
                "symbol": sym,
                "candle_count": 0,
                "first_date": None,
                "last_date": None,
                "last_close": None,
                "updated_at": str(updated) if updated else None,
            })
    return {"total_symbols": total, "symbols": symbols}


@router.post("/run")
async def run(payload: RunRequest):
    """Kick off the daily pull in the background. Poll /snapshot/status."""
    if _running["active"]:
        return {"started": False, "reason": "already running"}
    asyncio.create_task(_run_job(payload.index))
    return {"started": True, "index": payload.index}


@router.post("/history")
async def history():
    """One-time full pull: 5 years for the entire NSE equity universe (~30-45 min)."""
    if _running["active"]:
        return {"started": False, "reason": "already running"}
    asyncio.create_task(_history_job())
    return {"started": True, "mode": "full-history"}


@router.post("/topup")
async def topup():
    """Fast daily refresh: append today's candle via bulk quote, then recompute."""
    if _running["active"]:
        return {"started": False, "reason": "already running"}
    asyncio.create_task(_topup_job())
    return {"started": True, "mode": "topup"}


# --- Intraday (5-minute) candle pull ---

async def _intraday_job(interval: str):
    _running["active"] = True
    _running["current_symbol"] = ""
    try:
        async with async_session() as db:
            await snapshot_service.run_intraday_pull(
                db, interval=interval, on_progress=_on_progress,
            )
    finally:
        _running["active"] = False
        _running["current_symbol"] = ""


@router.post("/intraday")
async def intraday_pull(interval: str = "5minute"):
    """Pull intraday candles for all NSE equities. Accumulates with existing data."""
    if _running["active"]:
        return {"started": False, "reason": "already running"}
    if interval not in ("minute", "3minute", "5minute", "10minute", "15minute", "30minute", "60minute"):
        return {"started": False, "reason": f"invalid interval: {interval}"}
    asyncio.create_task(_intraday_job(interval))
    return {"started": True, "mode": "intraday", "interval": interval}


@router.get("/intraday-summary")
async def intraday_summary(db: AsyncSession = Depends(get_db)):
    """Stats for intraday candle store — symbol count, candle counts, date ranges."""
    return await snapshot_service.get_intraday_summary(db)
