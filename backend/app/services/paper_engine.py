"""Paper trading order-matching engine.

Processes orders against live/mock tick prices, manages positions and cash.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.paper_trading import PaperAccount, PaperOrder, PaperPosition, PaperTrade

log = logging.getLogger(__name__)

# In-memory latest prices fed from the WebSocket tick stream
_live_prices: dict[str, float] = {}


def update_prices(ticks: list[dict[str, Any]]) -> None:
    for t in ticks:
        sym = t.get("symbol")
        ltp = t.get("ltp") or t.get("last_price")
        if sym and ltp:
            _live_prices[sym] = float(ltp)


def get_price(symbol: str) -> float | None:
    return _live_prices.get(symbol)


def get_all_prices() -> dict[str, float]:
    return dict(_live_prices)


async def place_order(
    db: AsyncSession,
    account_id: int,
    symbol: str,
    side: str,
    quantity: int,
    order_type: str = "MARKET",
    price: float | None = None,
    trigger_price: float | None = None,
    strategy_id: int | None = None,
) -> dict[str, Any]:
    account = await db.get(PaperAccount, account_id)
    if not account:
        return {"error": "Account not found"}

    side = side.upper()
    order_type = order_type.upper()
    if side not in ("BUY", "SELL"):
        return {"error": "Side must be BUY or SELL"}
    if order_type not in ("MARKET", "LIMIT", "SL"):
        return {"error": "Order type must be MARKET, LIMIT, or SL"}
    if quantity <= 0:
        return {"error": "Quantity must be positive"}

    # Validate limit/SL orders have prices
    if order_type == "LIMIT" and price is None:
        return {"error": "Limit orders need a price"}
    if order_type == "SL" and trigger_price is None:
        return {"error": "SL orders need a trigger price"}

    # Check max positions for new buys
    if side == "BUY":
        res = await db.execute(
            select(PaperPosition).where(
                PaperPosition.account_id == account_id,
                PaperPosition.quantity > 0,
            )
        )
        open_positions = res.scalars().all()
        existing = [p for p in open_positions if p.symbol == symbol]
        if not existing and len(open_positions) >= account.max_positions:
            return {"error": f"Max {account.max_positions} positions reached"}

        # Check position size limit
        ltp = get_price(symbol) or price or 0
        if ltp > 0:
            order_value = ltp * quantity
            max_value = account.initial_balance * (account.max_position_pct / 100)
            if order_value > max_value:
                return {"error": f"Order value ₹{order_value:,.0f} exceeds {account.max_position_pct}% limit (₹{max_value:,.0f})"}

        # Check cash for buys
        est_price = price or get_price(symbol) or 0
        est_cost = est_price * quantity
        if est_cost > account.cash_balance * 1.01:  # 1% tolerance
            return {"error": f"Insufficient cash. Need ₹{est_cost:,.0f}, have ₹{account.cash_balance:,.0f}"}

    # Check we have position to sell
    if side == "SELL":
        res = await db.execute(
            select(PaperPosition).where(
                PaperPosition.account_id == account_id,
                PaperPosition.symbol == symbol,
                PaperPosition.quantity > 0,
            )
        )
        pos = res.scalar_one_or_none()
        if not pos or pos.quantity < quantity:
            avail = pos.quantity if pos else 0
            return {"error": f"Cannot sell {quantity} {symbol}, only hold {avail}"}

    order = PaperOrder(
        account_id=account_id,
        symbol=symbol,
        side=side,
        order_type=order_type,
        quantity=quantity,
        price=price,
        trigger_price=trigger_price,
        strategy_id=strategy_id,
        status="PENDING",
    )
    db.add(order)
    await db.flush()

    # Try immediate fill for market orders
    if order_type == "MARKET":
        ltp = get_price(symbol) or price
        if ltp:
            result = await _fill_order(db, order, ltp, account)
            await db.commit()
            return result
        # No price yet — stay pending, will fill on next tick
        await db.commit()
        return {"order_id": order.id, "status": "PENDING", "message": "Waiting for price tick"}

    await db.commit()
    return {"order_id": order.id, "status": "PENDING"}


async def _fill_order(
    db: AsyncSession,
    order: PaperOrder,
    market_price: float,
    account: PaperAccount,
) -> dict[str, Any]:
    # Apply slippage
    slippage_mult = account.slippage_bps / 10000
    if order.side == "BUY":
        fill_price = round(market_price * (1 + slippage_mult), 2)
    else:
        fill_price = round(market_price * (1 - slippage_mult), 2)

    commission = round(fill_price * order.quantity * (account.commission_pct / 100), 2)
    cost = fill_price * order.quantity

    trade_pnl = 0.0

    if order.side == "BUY":
        # Deduct cash
        account.cash_balance -= cost + commission

        # Update or create position
        res = await db.execute(
            select(PaperPosition).where(
                PaperPosition.account_id == account.id,
                PaperPosition.symbol == order.symbol,
                PaperPosition.quantity > 0,
            )
        )
        pos = res.scalar_one_or_none()
        if pos:
            total_cost = pos.avg_price * pos.quantity + fill_price * order.quantity
            pos.quantity += order.quantity
            pos.avg_price = round(total_cost / pos.quantity, 2)
        else:
            pos = PaperPosition(
                account_id=account.id,
                symbol=order.symbol,
                side="LONG",
                quantity=order.quantity,
                avg_price=fill_price,
            )
            db.add(pos)

    else:  # SELL
        res = await db.execute(
            select(PaperPosition).where(
                PaperPosition.account_id == account.id,
                PaperPosition.symbol == order.symbol,
                PaperPosition.quantity > 0,
            )
        )
        pos = res.scalar_one_or_none()
        if not pos:
            order.status = "REJECTED"
            order.reject_reason = "No position to sell"
            return {"order_id": order.id, "status": "REJECTED", "reason": "No position to sell"}

        # Realize P&L
        trade_pnl = round((fill_price - pos.avg_price) * order.quantity, 2)
        account.cash_balance += cost - commission
        pos.realized_pnl += trade_pnl
        pos.quantity -= order.quantity
        if pos.quantity <= 0:
            pos.quantity = 0
            pos.closed_at = datetime.now()

    # Mark order filled
    now = datetime.now()
    order.status = "FILLED"
    order.filled_price = fill_price
    order.filled_at = now

    # Log trade
    trade = PaperTrade(
        order_id=order.id,
        account_id=account.id,
        symbol=order.symbol,
        side=order.side,
        quantity=order.quantity,
        price=fill_price,
        pnl=trade_pnl,
        commission=commission,
    )
    db.add(trade)

    log.info(
        "Paper %s %s x%d @ ₹%.2f (pnl=%.2f, comm=%.2f)",
        order.side, order.symbol, order.quantity, fill_price, trade_pnl, commission,
    )

    return {
        "order_id": order.id,
        "status": "FILLED",
        "filled_price": fill_price,
        "commission": commission,
        "pnl": trade_pnl,
    }


async def check_pending_orders(db: AsyncSession) -> list[dict]:
    """Check all pending limit/SL orders against current prices. Called on each tick."""
    res = await db.execute(
        select(PaperOrder).where(PaperOrder.status == "PENDING")
    )
    pending = res.scalars().all()
    filled = []

    for order in pending:
        ltp = get_price(order.symbol)
        if not ltp:
            continue

        should_fill = False
        if order.order_type == "MARKET":
            should_fill = True
        elif order.order_type == "LIMIT":
            if order.side == "BUY" and ltp <= order.price:
                should_fill = True
            elif order.side == "SELL" and ltp >= order.price:
                should_fill = True
        elif order.order_type == "SL":
            if order.side == "SELL" and ltp <= order.trigger_price:
                should_fill = True
            elif order.side == "BUY" and ltp >= order.trigger_price:
                should_fill = True

        if should_fill:
            account = await db.get(PaperAccount, order.account_id)
            if account:
                result = await _fill_order(db, order, ltp, account)
                filled.append(result)

    if filled:
        await db.commit()
    return filled


async def get_portfolio(db: AsyncSession, account_id: int) -> dict[str, Any]:
    account = await db.get(PaperAccount, account_id)
    if not account:
        return {"error": "Account not found"}

    res = await db.execute(
        select(PaperPosition).where(
            PaperPosition.account_id == account_id,
            PaperPosition.quantity > 0,
        )
    )
    positions = res.scalars().all()

    total_unrealized = 0.0
    total_invested = 0.0
    pos_data = []
    for p in positions:
        ltp = get_price(p.symbol) or p.avg_price
        unrealized = round((ltp - p.avg_price) * p.quantity, 2)
        invested = p.avg_price * p.quantity
        total_unrealized += unrealized
        total_invested += invested
        pos_data.append({
            "id": p.id,
            "symbol": p.symbol,
            "side": p.side,
            "quantity": p.quantity,
            "avg_price": p.avg_price,
            "ltp": round(ltp, 2),
            "invested": round(invested, 2),
            "unrealized_pnl": unrealized,
            "unrealized_pnl_pct": round(unrealized / invested * 100, 2) if invested else 0,
            "realized_pnl": round(p.realized_pnl, 2),
        })

    # Realized P&L from trades
    from sqlalchemy import func as sqlfunc
    res2 = await db.execute(
        select(
            sqlfunc.coalesce(sqlfunc.sum(PaperTrade.pnl), 0),
            sqlfunc.coalesce(sqlfunc.sum(PaperTrade.commission), 0),
        ).where(PaperTrade.account_id == account_id)
    )
    row = res2.one()
    total_realized = float(row[0])
    total_commission = float(row[1])

    equity = account.cash_balance + total_invested + total_unrealized
    total_pnl = equity - account.initial_balance

    return {
        "account_id": account.id,
        "name": account.name,
        "initial_balance": account.initial_balance,
        "cash_balance": round(account.cash_balance, 2),
        "invested": round(total_invested, 2),
        "equity": round(equity, 2),
        "total_pnl": round(total_pnl, 2),
        "total_pnl_pct": round(total_pnl / account.initial_balance * 100, 2),
        "unrealized_pnl": round(total_unrealized, 2),
        "realized_pnl": round(total_realized, 2),
        "total_commission": round(total_commission, 2),
        "open_positions": len(pos_data),
        "max_positions": account.max_positions,
        "positions": pos_data,
    }
