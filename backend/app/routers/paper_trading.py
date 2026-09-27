from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func as sqlfunc, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete as sa_delete

from app.core.database import get_db
from app.models.paper_trading import PaperAccount, PaperOrder, PaperPosition, PaperTrade
from app.services import paper_engine

router = APIRouter(prefix="/api/paper", tags=["paper-trading"])


# ---------- request schemas ----------

class CreateAccountReq(BaseModel):
    name: str = "Default"
    initial_balance: float = 100000
    slippage_bps: float = 5
    commission_pct: float = 0.03
    max_position_pct: float = 20
    max_positions: int = 10
    daily_loss_limit_pct: float = 5


class PlaceOrderReq(BaseModel):
    account_id: int
    symbol: str
    side: str
    quantity: int
    order_type: str = "MARKET"
    price: float | None = None
    trigger_price: float | None = None
    strategy_id: int | None = None


# ---------- accounts ----------

@router.get("/accounts")
async def list_accounts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(PaperAccount).order_by(desc(PaperAccount.created_at)))
    accounts = res.scalars().all()
    out = []
    for a in accounts:
        # Quick equity calc
        pos_res = await db.execute(
            select(PaperPosition).where(
                PaperPosition.account_id == a.id,
                PaperPosition.quantity > 0,
            )
        )
        positions = pos_res.scalars().all()
        invested = sum(p.avg_price * p.quantity for p in positions)
        unrealized = sum(
            ((paper_engine.get_price(p.symbol) or p.avg_price) - p.avg_price) * p.quantity
            for p in positions
        )
        equity = a.cash_balance + invested + unrealized
        tradable = []
        if a.tradable_symbols:
            try:
                tradable = json.loads(a.tradable_symbols)
            except (json.JSONDecodeError, TypeError):
                tradable = []
        out.append({
            "id": a.id,
            "name": a.name,
            "initial_balance": a.initial_balance,
            "cash_balance": round(a.cash_balance, 2),
            "equity": round(equity, 2),
            "total_pnl": round(equity - a.initial_balance, 2),
            "total_pnl_pct": round((equity - a.initial_balance) / a.initial_balance * 100, 2),
            "open_positions": len(positions),
            "is_active": a.is_active,
            "strategy_id": a.strategy_id,
            "batch_id": a.batch_id,
            "tradable_symbols": tradable,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })
    return out


@router.post("/accounts")
async def create_account(req: CreateAccountReq, db: AsyncSession = Depends(get_db)):
    account = PaperAccount(
        name=req.name,
        initial_balance=req.initial_balance,
        cash_balance=req.initial_balance,
        slippage_bps=req.slippage_bps,
        commission_pct=req.commission_pct,
        max_position_pct=req.max_position_pct,
        max_positions=req.max_positions,
        daily_loss_limit_pct=req.daily_loss_limit_pct,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return {"id": account.id, "name": account.name, "balance": account.cash_balance}


class UpdateAccountConfigReq(BaseModel):
    strategy_id: int | None = None
    batch_id: int | None = None
    tradable_symbols: list[str] | None = None


@router.patch("/accounts/{account_id}/config")
async def update_account_config(account_id: int, req: UpdateAccountConfigReq, db: AsyncSession = Depends(get_db)):
    account = await db.get(PaperAccount, account_id)
    if not account:
        return {"error": "Account not found"}
    if req.strategy_id is not None:
        account.strategy_id = req.strategy_id if req.strategy_id != 0 else None
    if req.batch_id is not None:
        account.batch_id = req.batch_id if req.batch_id != 0 else None
    if req.tradable_symbols is not None:
        account.tradable_symbols = json.dumps(req.tradable_symbols)
    await db.commit()
    return {"ok": True}


@router.get("/accounts/{account_id}")
async def get_account(account_id: int, db: AsyncSession = Depends(get_db)):
    account = await db.get(PaperAccount, account_id)
    if not account:
        return {"error": "Account not found"}
    return {
        "id": account.id,
        "name": account.name,
        "initial_balance": account.initial_balance,
        "cash_balance": round(account.cash_balance, 2),
        "slippage_bps": account.slippage_bps,
        "commission_pct": account.commission_pct,
        "max_position_pct": account.max_position_pct,
        "max_positions": account.max_positions,
        "daily_loss_limit_pct": account.daily_loss_limit_pct,
        "is_active": account.is_active,
        "created_at": account.created_at.isoformat() if account.created_at else None,
    }


@router.post("/accounts/{account_id}/reset")
async def reset_account(account_id: int, db: AsyncSession = Depends(get_db)):
    account = await db.get(PaperAccount, account_id)
    if not account:
        return {"error": "Account not found"}
    # Delete all orders, positions, trades for this account
    await db.execute(sa_delete(PaperTrade).where(PaperTrade.account_id == account_id))
    await db.execute(sa_delete(PaperOrder).where(PaperOrder.account_id == account_id))
    await db.execute(sa_delete(PaperPosition).where(PaperPosition.account_id == account_id))
    account.cash_balance = account.initial_balance
    await db.commit()
    return {"status": "reset", "cash_balance": account.cash_balance}


# ---------- orders ----------

@router.post("/orders")
async def place_order(req: PlaceOrderReq, db: AsyncSession = Depends(get_db)):
    result = await paper_engine.place_order(
        db=db,
        account_id=req.account_id,
        symbol=req.symbol.upper(),
        side=req.side,
        quantity=req.quantity,
        order_type=req.order_type,
        price=req.price,
        trigger_price=req.trigger_price,
        strategy_id=req.strategy_id,
    )
    return result


@router.get("/orders")
async def list_orders(
    account_id: int,
    status: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    q = select(PaperOrder).where(PaperOrder.account_id == account_id)
    if status:
        q = q.where(PaperOrder.status == status.upper())
    q = q.order_by(desc(PaperOrder.created_at)).limit(limit)
    res = await db.execute(q)
    orders = res.scalars().all()
    return [
        {
            "id": o.id,
            "symbol": o.symbol,
            "side": o.side,
            "order_type": o.order_type,
            "quantity": o.quantity,
            "price": o.price,
            "trigger_price": o.trigger_price,
            "status": o.status,
            "filled_price": o.filled_price,
            "filled_at": o.filled_at.isoformat() if o.filled_at else None,
            "reject_reason": o.reject_reason,
            "strategy_id": o.strategy_id,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
        for o in orders
    ]


@router.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: int, db: AsyncSession = Depends(get_db)):
    order = await db.get(PaperOrder, order_id)
    if not order:
        return {"error": "Order not found"}
    if order.status != "PENDING":
        return {"error": f"Cannot cancel {order.status} order"}
    order.status = "CANCELLED"
    await db.commit()
    return {"order_id": order.id, "status": "CANCELLED"}


# ---------- positions ----------

@router.get("/positions")
async def list_positions(account_id: int, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(PaperPosition).where(
            PaperPosition.account_id == account_id,
            PaperPosition.quantity > 0,
        )
    )
    positions = res.scalars().all()
    return [
        {
            "id": p.id,
            "symbol": p.symbol,
            "side": p.side,
            "quantity": p.quantity,
            "avg_price": round(p.avg_price, 2),
            "ltp": round(paper_engine.get_price(p.symbol) or p.avg_price, 2),
            "invested": round(p.avg_price * p.quantity, 2),
            "unrealized_pnl": round(
                ((paper_engine.get_price(p.symbol) or p.avg_price) - p.avg_price) * p.quantity, 2
            ),
            "realized_pnl": round(p.realized_pnl, 2),
            "opened_at": p.opened_at.isoformat() if p.opened_at else None,
        }
        for p in positions
    ]


@router.post("/positions/{position_id}/close")
async def close_position(position_id: int, db: AsyncSession = Depends(get_db)):
    pos = await db.get(PaperPosition, position_id)
    if not pos or pos.quantity <= 0:
        return {"error": "Position not found or already closed"}
    result = await paper_engine.place_order(
        db=db,
        account_id=pos.account_id,
        symbol=pos.symbol,
        side="SELL",
        quantity=pos.quantity,
        order_type="MARKET",
    )
    return result


# ---------- trades ----------

@router.get("/trades")
async def list_trades(
    account_id: int,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(PaperTrade)
        .where(PaperTrade.account_id == account_id)
        .order_by(desc(PaperTrade.executed_at))
        .limit(limit)
    )
    trades = res.scalars().all()
    order_ids = [t.order_id for t in trades]
    order_map: dict[int, PaperOrder] = {}
    if order_ids:
        ores = await db.execute(select(PaperOrder).where(PaperOrder.id.in_(order_ids)))
        for o in ores.scalars().all():
            order_map[o.id] = o
    return [
        {
            "id": t.id,
            "order_id": t.order_id,
            "symbol": t.symbol,
            "side": t.side,
            "quantity": t.quantity,
            "price": round(t.price, 2),
            "pnl": round(t.pnl, 2),
            "commission": round(t.commission, 2),
            "executed_at": t.executed_at.isoformat() if t.executed_at else None,
            "strategy_id": order_map.get(t.order_id, None) and order_map[t.order_id].strategy_id,
            "order_type": order_map.get(t.order_id, None) and order_map[t.order_id].order_type,
        }
        for t in trades
    ]


# ---------- portfolio ----------

@router.get("/portfolio")
async def portfolio(account_id: int, db: AsyncSession = Depends(get_db)):
    return await paper_engine.get_portfolio(db, account_id)


# ---------- prices (for frontend to know what engine sees) ----------

@router.get("/prices")
async def get_prices():
    return paper_engine.get_all_prices()
