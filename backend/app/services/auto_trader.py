"""Auto-trading engine: runs strategies against live prices and places real Zerodha orders."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.live_trading import LiveSession, LiveOrder
from app.models.strategy import Strategy
from app.services.kite_service import kite_service
from app.services import paper_engine

log = logging.getLogger(__name__)

_running_sessions: dict[int, asyncio.Task] = {}


async def start_session(db: AsyncSession, session_id: int) -> dict:
    sess = await db.get(LiveSession, session_id)
    if not sess:
        return {"error": "Session not found"}
    if session_id in _running_sessions and not _running_sessions[session_id].done():
        return {"error": "Session already running"}
    sess.status = "running"
    await db.commit()
    task = asyncio.create_task(_auto_scan_loop(session_id))
    _running_sessions[session_id] = task
    return {"status": "running", "session_id": session_id}


async def stop_session(db: AsyncSession, session_id: int) -> dict:
    sess = await db.get(LiveSession, session_id)
    if not sess:
        return {"error": "Session not found"}
    if session_id in _running_sessions:
        _running_sessions[session_id].cancel()
        del _running_sessions[session_id]
    sess.status = "stopped"
    await db.commit()
    return {"status": "stopped", "session_id": session_id}


async def _auto_scan_loop(session_id: int):
    """Background loop: scans strategy signals and places orders."""
    from app.core.database import async_session
    try:
        while True:
            async with async_session() as db:
                sess = await db.get(LiveSession, session_id)
                if not sess or sess.status != "running":
                    break

                strategy = await db.get(Strategy, sess.strategy_id)
                if not strategy:
                    log.warning("Session %d: strategy %d not found", session_id, sess.strategy_id)
                    await asyncio.sleep(60)
                    continue

                symbols = [s.strip() for s in sess.symbols.split(",") if s.strip()]
                if not symbols:
                    await asyncio.sleep(sess.scan_interval_sec)
                    continue

                signals = _evaluate_strategy(strategy, symbols)

                for sig in signals:
                    if sess.daily_loss_limit > 0 and sess.pnl_today <= -sess.daily_loss_limit:
                        log.info("Session %d: daily loss limit hit, skipping signals", session_id)
                        break

                    order = LiveOrder(
                        session_id=session_id,
                        symbol=sig["symbol"],
                        side=sig["side"],
                        order_type="MARKET",
                        quantity=sess.per_trade_qty,
                        signal_reason=sig.get("reason", ""),
                        needs_approval=(sess.mode == "manual"),
                        status="PENDING",
                    )
                    db.add(order)
                    await db.flush()

                    if sess.mode == "auto":
                        await _execute_order(db, order, sess)

                await db.commit()
                await asyncio.sleep(sess.scan_interval_sec)
    except asyncio.CancelledError:
        log.info("Auto-scan loop cancelled for session %d", session_id)
    except Exception:
        log.exception("Auto-scan loop error for session %d", session_id)


def _evaluate_strategy(strategy: Strategy, symbols: list[str]) -> list[dict]:
    """Evaluate strategy against current prices to generate signals."""
    signals = []
    prices = paper_engine.get_all_prices()

    if strategy.strategy_type == "visual" and strategy.filters:
        import json
        try:
            conditions = json.loads(strategy.filters)
        except Exception:
            return signals

        entry_conds = conditions.get("entry", [])
        exit_conds = conditions.get("exit", [])

        for sym in symbols:
            ltp = prices.get(sym)
            if not ltp:
                continue
            if _check_visual_conditions(entry_conds, sym, ltp):
                signals.append({"symbol": sym, "side": "BUY", "reason": f"Entry conditions met for {strategy.name}"})
            elif _check_visual_conditions(exit_conds, sym, ltp):
                signals.append({"symbol": sym, "side": "SELL", "reason": f"Exit conditions met for {strategy.name}"})

    elif strategy.code:
        for sym in symbols:
            ltp = prices.get(sym)
            if not ltp:
                continue
            signal = _run_code_strategy(strategy.code, sym, ltp)
            if signal:
                signals.append(signal)

    return signals


def _check_visual_conditions(conditions: list[dict], symbol: str, ltp: float) -> bool:
    """Simple condition evaluator for visual strategies."""
    if not conditions:
        return False
    for cond in conditions:
        indicator = cond.get("indicator", "")
        operator = cond.get("operator", ">")
        value = cond.get("value", 0)
        if "price" in indicator or "ltp" in indicator:
            actual = ltp
        else:
            actual = ltp  # fallback — real impl would compute indicators
        if not _compare(actual, operator, float(value)):
            return False
    return True


def _compare(actual: float, op: str, value: float) -> bool:
    if op == ">":
        return actual > value
    if op == ">=":
        return actual >= value
    if op == "<":
        return actual < value
    if op == "<=":
        return actual <= value
    if op == "==" or op == "=":
        return abs(actual - value) < 0.01
    return False


def _run_code_strategy(code: str, symbol: str, ltp: float) -> dict | None:
    """Run a code strategy in a sandboxed way to get a signal."""
    try:
        local_ns: dict[str, Any] = {"symbol": symbol, "ltp": ltp, "signal": None}
        exec(code, {"__builtins__": {}}, local_ns)
        sig = local_ns.get("signal")
        if sig and isinstance(sig, dict) and sig.get("side"):
            return {"symbol": symbol, "side": sig["side"], "reason": sig.get("reason", "Code strategy signal")}
    except Exception:
        pass
    return None


async def _execute_order(db: AsyncSession, order: LiveOrder, sess: LiveSession):
    """Place a real order on Zerodha."""
    if not kite_service.is_connected:
        order.status = "REJECTED"
        order.signal_reason += " | Kite not connected"
        return

    try:
        kite_order_id = kite_service.place_order(
            exchange="NSE",
            tradingsymbol=order.symbol,
            transaction_type=order.side,
            quantity=order.quantity,
            order_type=order.order_type,
            price=order.price,
            trigger_price=order.trigger_price,
            product=sess.product,
        )
        order.kite_order_id = str(kite_order_id)
        order.status = "PLACED"
        sess.trades_today += 1
        log.info("Live order placed: %s %s x%d → %s", order.side, order.symbol, order.quantity, kite_order_id)
    except Exception as e:
        order.status = "REJECTED"
        order.signal_reason += f" | Order error: {e}"
        log.exception("Failed to place live order for %s", order.symbol)


async def approve_order(db: AsyncSession, order_id: int) -> dict:
    """Approve a pending manual-mode order and execute it."""
    order = await db.get(LiveOrder, order_id)
    if not order:
        return {"error": "Order not found"}
    if order.status != "PENDING" or not order.needs_approval:
        return {"error": f"Order not pending approval (status={order.status})"}

    sess = await db.get(LiveSession, order.session_id)
    if not sess:
        return {"error": "Session not found"}

    order.approved = True
    await _execute_order(db, order, sess)
    await db.commit()
    return {"order_id": order.id, "status": order.status, "kite_order_id": order.kite_order_id}


async def reject_order(db: AsyncSession, order_id: int) -> dict:
    order = await db.get(LiveOrder, order_id)
    if not order:
        return {"error": "Order not found"}
    order.status = "CANCELLED"
    order.approved = False
    await db.commit()
    return {"order_id": order.id, "status": "CANCELLED"}


async def sync_order_status(db: AsyncSession, session_id: int) -> list[dict]:
    """Sync order statuses from Zerodha for a session."""
    if not kite_service.is_connected:
        return []

    try:
        kite_orders = kite_service.get_orders()
    except Exception:
        return []

    kite_map = {str(o["order_id"]): o for o in kite_orders}
    res = await db.execute(
        select(LiveOrder).where(
            LiveOrder.session_id == session_id,
            LiveOrder.status == "PLACED",
        )
    )
    updated = []
    for order in res.scalars().all():
        ko = kite_map.get(order.kite_order_id)
        if not ko:
            continue
        order.kite_status = ko["status"]
        if ko["status"] == "COMPLETE":
            order.status = "COMPLETE"
            order.filled_price = ko.get("average_price") or ko.get("price", 0)
            updated.append({"order_id": order.id, "symbol": order.symbol, "filled": order.filled_price})
        elif ko["status"] in ("CANCELLED", "REJECTED"):
            order.status = ko["status"]

    if updated:
        await db.commit()
    return updated
