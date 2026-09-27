from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.live_trading import LiveSession, LiveOrder
from app.models.strategy import Strategy
from app.models.batch import Batch
from app.services import auto_trader
from app.services.kite_service import kite_service

router = APIRouter(prefix="/api/live", tags=["live-trading"])


# ---------- request schemas ----------

class CreateSessionReq(BaseModel):
    name: str = "Live Session"
    strategy_id: int
    batch_id: int | None = None
    symbols: list[str] = []
    mode: str = "manual"
    product: str = "CNC"
    per_trade_qty: int = 1
    max_positions: int = 5
    max_position_pct: float = 10
    stoploss_pct: float = 3.0
    target_pct: float = 6.0
    daily_loss_limit: float = 10000
    scan_interval_sec: int = 60


class PlaceManualOrderReq(BaseModel):
    session_id: int | None = None
    symbol: str
    side: str
    quantity: int
    order_type: str = "MARKET"
    price: float | None = None
    trigger_price: float | None = None
    product: str = "CNC"
    stoploss: float | None = None


# ---------- sessions ----------

@router.get("/sessions")
async def list_sessions(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(LiveSession).order_by(desc(LiveSession.updated_at)))
    sessions = res.scalars().all()
    return [_session_dict(s) for s in sessions]


@router.post("/sessions")
async def create_session(req: CreateSessionReq, db: AsyncSession = Depends(get_db)):
    strategy = await db.get(Strategy, req.strategy_id)
    if not strategy:
        return {"error": "Strategy not found"}

    batch_name = ""
    if req.batch_id:
        batch = await db.get(Batch, req.batch_id)
        if batch:
            batch_name = batch.name
            if not req.symbols:
                req.symbols = [s.strip() for s in batch.symbols.split(",") if s.strip()]

    sess = LiveSession(
        name=req.name,
        strategy_id=req.strategy_id,
        strategy_name=strategy.name,
        batch_id=req.batch_id,
        batch_name=batch_name,
        symbols=",".join(req.symbols),
        mode=req.mode,
        product=req.product,
        per_trade_qty=req.per_trade_qty,
        max_positions=req.max_positions,
        max_position_pct=req.max_position_pct,
        stoploss_pct=req.stoploss_pct,
        target_pct=req.target_pct,
        daily_loss_limit=req.daily_loss_limit,
        scan_interval_sec=req.scan_interval_sec,
    )
    db.add(sess)
    await db.commit()
    await db.refresh(sess)
    return _session_dict(sess)


@router.get("/sessions/{session_id}")
async def get_session(session_id: int, db: AsyncSession = Depends(get_db)):
    sess = await db.get(LiveSession, session_id)
    if not sess:
        return {"error": "Session not found"}
    return _session_dict(sess)


@router.post("/sessions/{session_id}/start")
async def start_session(session_id: int, db: AsyncSession = Depends(get_db)):
    return await auto_trader.start_session(db, session_id)


@router.post("/sessions/{session_id}/stop")
async def stop_session(session_id: int, db: AsyncSession = Depends(get_db)):
    return await auto_trader.stop_session(db, session_id)


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: int, db: AsyncSession = Depends(get_db)):
    sess = await db.get(LiveSession, session_id)
    if not sess:
        return {"error": "Session not found"}
    await auto_trader.stop_session(db, session_id)
    from sqlalchemy import delete as sa_delete
    await db.execute(sa_delete(LiveOrder).where(LiveOrder.session_id == session_id))
    await db.delete(sess)
    await db.commit()
    return {"ok": True}


# ---------- orders ----------

@router.post("/orders")
async def place_manual_order(req: PlaceManualOrderReq, db: AsyncSession = Depends(get_db)):
    """Place a manual order directly on Zerodha."""
    if not kite_service.is_connected:
        return {"status": "error", "message": "Kite not connected. Login first."}
    try:
        order_id = kite_service.place_order(
            exchange="NSE",
            tradingsymbol=req.symbol.upper(),
            transaction_type=req.side.upper(),
            quantity=req.quantity,
            order_type=req.order_type.upper(),
            price=req.price,
            trigger_price=req.trigger_price,
            product=req.product,
            stoploss=req.stoploss,
        )
        order = LiveOrder(
            session_id=req.session_id or 0,
            kite_order_id=str(order_id),
            symbol=req.symbol.upper(),
            side=req.side.upper(),
            order_type=req.order_type.upper(),
            quantity=req.quantity,
            price=req.price,
            trigger_price=req.trigger_price,
            status="PLACED",
            signal_reason="Manual order",
        )
        db.add(order)
        await db.commit()
        return {"status": "success", "order_id": str(order_id)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/orders")
async def list_orders(
    session_id: int | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    q = select(LiveOrder)
    if session_id:
        q = q.where(LiveOrder.session_id == session_id)
    q = q.order_by(desc(LiveOrder.created_at)).limit(limit)
    res = await db.execute(q)
    return [_order_dict(o) for o in res.scalars().all()]


@router.post("/orders/{order_id}/approve")
async def approve_order(order_id: int, db: AsyncSession = Depends(get_db)):
    return await auto_trader.approve_order(db, order_id)


@router.post("/orders/{order_id}/reject")
async def reject_order(order_id: int, db: AsyncSession = Depends(get_db)):
    return await auto_trader.reject_order(db, order_id)


@router.post("/orders/{order_id}/cancel")
async def cancel_kite_order(order_id: int, db: AsyncSession = Depends(get_db)):
    order = await db.get(LiveOrder, order_id)
    if not order:
        return {"error": "Order not found"}
    if order.kite_order_id and kite_service.is_connected:
        try:
            kite_service.cancel_order(order.kite_order_id)
        except Exception:
            pass
    order.status = "CANCELLED"
    await db.commit()
    return {"order_id": order.id, "status": "CANCELLED"}


# ---------- sync ----------

@router.post("/sync")
async def sync_orders(session_id: int | None = None, db: AsyncSession = Depends(get_db)):
    """Sync order statuses from Zerodha."""
    if session_id:
        updated = await auto_trader.sync_order_status(db, session_id)
        return {"synced": updated}

    res = await db.execute(
        select(LiveSession).where(LiveSession.status.in_(["running", "idle"]))
    )
    all_updated = []
    for sess in res.scalars().all():
        updated = await auto_trader.sync_order_status(db, sess.id)
        all_updated.extend(updated)
    return {"synced": all_updated}


# ---------- portfolio (live from Kite) ----------

@router.get("/portfolio")
async def live_portfolio():
    """Get live portfolio from Zerodha."""
    if not kite_service.is_connected:
        return {"connected": False, "positions": [], "holdings": [], "margins": {}}
    try:
        positions = kite_service.get_positions()
        holdings = kite_service.get_holdings()
        margins = kite_service.get_margins()
        net = positions.get("net", [])
        day = positions.get("day", [])
        return {
            "connected": True,
            "positions": [
                {
                    "symbol": p["tradingsymbol"],
                    "exchange": p.get("exchange", "NSE"),
                    "quantity": p["quantity"],
                    "avg_price": p["average_price"],
                    "ltp": p["last_price"],
                    "pnl": p["pnl"],
                    "product": p.get("product", ""),
                    "day_change": p.get("day_m2m", 0),
                }
                for p in net if p["quantity"] != 0
            ],
            "holdings": [
                {
                    "symbol": h["tradingsymbol"],
                    "quantity": h["quantity"],
                    "avg_price": h["average_price"],
                    "ltp": h.get("last_price", 0),
                    "pnl": h.get("pnl", 0),
                    "day_change": h.get("day_change", 0),
                    "day_change_pct": h.get("day_change_percentage", 0),
                }
                for h in holdings if h["quantity"] > 0
            ],
            "margins": {
                "equity_available": margins.get("equity", {}).get("available", {}).get("live_balance", 0),
                "equity_used": margins.get("equity", {}).get("utilised", {}).get("debits", 0),
            },
            "day_pnl": {
                "realized": sum(p.get("realised", 0) for p in day),
                "unrealized": sum(p.get("unrealised", 0) for p in day),
            },
        }
    except Exception as e:
        return {"connected": False, "error": str(e), "positions": [], "holdings": [], "margins": {}}


# ---------- helpers ----------

def _session_dict(s: LiveSession) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "strategy_id": s.strategy_id,
        "strategy_name": s.strategy_name,
        "batch_id": s.batch_id,
        "batch_name": s.batch_name,
        "symbols": [x.strip() for x in s.symbols.split(",") if x.strip()],
        "mode": s.mode,
        "status": s.status,
        "product": s.product,
        "per_trade_qty": s.per_trade_qty,
        "max_positions": s.max_positions,
        "stoploss_pct": s.stoploss_pct,
        "target_pct": s.target_pct,
        "daily_loss_limit": s.daily_loss_limit,
        "scan_interval_sec": s.scan_interval_sec,
        "trades_today": s.trades_today,
        "pnl_today": s.pnl_today,
        "is_active": s.is_active,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def _order_dict(o: LiveOrder) -> dict:
    return {
        "id": o.id,
        "session_id": o.session_id,
        "kite_order_id": o.kite_order_id,
        "symbol": o.symbol,
        "side": o.side,
        "order_type": o.order_type,
        "quantity": o.quantity,
        "price": o.price,
        "trigger_price": o.trigger_price,
        "status": o.status,
        "kite_status": o.kite_status,
        "filled_price": o.filled_price,
        "pnl": o.pnl,
        "signal_reason": o.signal_reason,
        "needs_approval": o.needs_approval,
        "approved": o.approved,
        "created_at": o.created_at.isoformat() if o.created_at else None,
    }
