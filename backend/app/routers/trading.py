import random

from fastapi import APIRouter, Body, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.instrument import Instrument, IndexMember
from app.services.kite_service import kite_service
from app.services.mock_data import generate_price

router = APIRouter(prefix="/api/trading", tags=["trading"])


@router.get("/positions")
async def get_positions(db: AsyncSession = Depends(get_db)):
    if not kite_service.is_connected:
        return _mock_positions(db)
    try:
        pos_data = kite_service.get_positions()
        net = pos_data.get("net", [])
        return [
            {
                "id": str(i),
                "symbol": p["tradingsymbol"],
                "quantity": p["quantity"],
                "avg_price": p["average_price"],
                "ltp": p["last_price"],
                "pnl": p["pnl"],
            }
            for i, p in enumerate(net, 1) if p["quantity"] != 0
        ]
    except Exception:
        return []


def _mock_positions(db=None) -> list[dict]:
    symbols = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK"]
    positions = []
    for i, sym in enumerate(random.sample(symbols, k=3), 1):
        price = generate_price(sym)
        qty = random.choice([5, 10, 15, 25])
        pnl = round(price * qty * random.uniform(-0.03, 0.04), 2)
        positions.append({
            "id": str(i), "symbol": sym, "quantity": qty,
            "avg_price": round(price * 0.98, 2), "ltp": price, "pnl": pnl,
        })
    return positions


@router.get("/orders")
async def get_orders():
    if not kite_service.is_connected:
        return []
    try:
        orders = kite_service.get_orders()
        return [
            {
                "id": o["order_id"],
                "symbol": o["tradingsymbol"],
                "order_type": o["order_type"],
                "side": o["transaction_type"],
                "quantity": o["quantity"],
                "price": o.get("price") or o.get("average_price") or 0,
                "status": o["status"],
                "strategy_id": o.get("tag"),
                "time": str(o.get("order_timestamp", "")),
            }
            for o in orders
        ]
    except Exception:
        return []


@router.get("/signals")
async def get_signals():
    return []


@router.get("/pnl")
async def get_pnl():
    if not kite_service.is_connected:
        return {"realized": 0, "unrealized": 0, "total": 0}
    try:
        pos_data = kite_service.get_positions()
        day = pos_data.get("day", [])
        realized = sum(p.get("realised", 0) for p in day)
        unrealized = sum(p.get("unrealised", 0) for p in day)
        return {
            "realized": round(realized, 2),
            "unrealized": round(unrealized, 2),
            "total": round(realized + unrealized, 2),
        }
    except Exception:
        return {"realized": 0, "unrealized": 0, "total": 0}


@router.get("/watchlist")
async def get_watchlist(db: AsyncSession = Depends(get_db)):
    idx_res = await db.execute(
        select(IndexMember.symbol).where(
            IndexMember.index_name == "NIFTY50", IndexMember.active == True
        )
    )
    nifty50 = [r[0] for r in idx_res.all()]
    symbols = random.sample(nifty50, k=min(10, len(nifty50))) if nifty50 else []

    if not kite_service.is_connected:
        return [
            {
                "symbol": sym, "name": sym, "ltp": generate_price(sym),
                "change_pct": round(random.uniform(-2.5, 2.5), 2),
                "volume": random.randint(500_000, 10_000_000),
                "signal": "—", "status": "Watching",
            }
            for sym in symbols
        ]

    try:
        instruments = [f"NSE:{s}" for s in symbols]
        quotes = kite_service.get_quote(instruments)
        result = []
        for key, q in quotes.items():
            symbol = key.split(":")[1]
            ohlc = q.get("ohlc", {})
            result.append({
                "symbol": symbol,
                "ltp": q.get("last_price", 0),
                "open": ohlc.get("open", 0),
                "high": ohlc.get("high", 0),
                "low": ohlc.get("low", 0),
                "close": ohlc.get("close", 0),
                "volume": q.get("volume", 0),
                "change_pct": round(
                    ((q.get("last_price", 0) - ohlc.get("close", 1)) / max(ohlc.get("close", 1), 1)) * 100, 2
                ),
                "signal": "—",
                "status": "Watching",
            })
        return result
    except Exception:
        return []


@router.post("/order")
async def place_order(
    symbol: str = Body(...),
    exchange: str = Body("NSE"),
    side: str = Body(...),
    quantity: int = Body(...),
    order_type: str = Body("MARKET"),
    price: float | None = Body(None),
    trigger_price: float | None = Body(None),
    stoploss: float | None = Body(None),
    target: float | None = Body(None),
    product: str = Body("CNC"),
):
    if not kite_service.is_connected:
        return {"status": "error", "message": "Kite not connected. Login first."}
    try:
        order_id = kite_service.place_order(
            exchange=exchange,
            tradingsymbol=symbol,
            transaction_type=side,
            quantity=quantity,
            order_type=order_type,
            price=price,
            trigger_price=trigger_price,
            product=product,
            stoploss=stoploss,
            target=target,
        )
        return {"status": "success", "order_id": order_id}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/order/{order_id}/cancel")
async def cancel_order(order_id: str):
    if not kite_service.is_connected:
        return {"status": "error", "message": "Kite not connected"}
    try:
        kite_service.cancel_order(order_id)
        return {"status": "success", "order_id": order_id}
    except Exception as e:
        return {"status": "error", "message": str(e)}
