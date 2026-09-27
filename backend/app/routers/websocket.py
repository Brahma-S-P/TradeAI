import asyncio
import json
import random
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, async_session
from app.models.instrument import Instrument, IndexMember
from app.services.kite_service import kite_service
from app.services.mock_data import generate_price
from app.services import paper_engine

router = APIRouter()
log = logging.getLogger(__name__)

_tick_store: dict[str, dict] = {}


def _start_kite_ticker(instrument_tokens: list[int]) -> None:
    """Start KiteTicker in a background thread to receive live ticks."""
    ticker = kite_service.create_ticker()
    if not ticker:
        return

    def on_ticks(ws, ticks):
        for t in ticks:
            symbol = t.get("instrument_token")
            _tick_store[str(symbol)] = {
                "instrument_token": symbol,
                "ltp": t.get("last_price", 0),
                "volume": t.get("volume_traded", 0),
                "change_pct": round(
                    ((t.get("last_price", 0) - t.get("ohlc", {}).get("close", 1))
                     / max(t.get("ohlc", {}).get("close", 1), 1)) * 100, 2
                ),
            }

    def on_connect(ws, response):
        ws.subscribe(instrument_tokens)
        ws.set_mode(ws.MODE_QUOTE, instrument_tokens)
        log.info("KiteTicker connected, subscribed to %d tokens", len(instrument_tokens))

    ticker.on_ticks = on_ticks
    ticker.on_connect = on_connect
    ticker.connect(threaded=True)


@router.websocket("/ws/prices")
async def websocket_prices(websocket: WebSocket):
    await websocket.accept()

    async with async_session() as db:
        idx_res = await db.execute(
            select(IndexMember.symbol).where(
                IndexMember.index_name == "NIFTY500", IndexMember.active == True
            )
        )
        universe_syms = [r[0] for r in idx_res.all()]

    if kite_service.is_connected:
        try:
            instruments = kite_service.get_instruments("NSE")
            sym_set = set(universe_syms)
            token_map = {}
            for inst in instruments:
                sym = inst["tradingsymbol"]
                if sym in sym_set and inst.get("instrument_type") == "EQ":
                    token_map[str(inst["instrument_token"])] = sym

            if token_map and not _tick_store:
                _start_kite_ticker([int(t) for t in token_map])

            try:
                while True:
                    ticks = []
                    for token_str, symbol in token_map.items():
                        if token_str in _tick_store:
                            tick = _tick_store[token_str]
                            ticks.append({
                                "symbol": symbol,
                                "ltp": tick["ltp"],
                                "change_pct": tick["change_pct"],
                                "volume": tick["volume"],
                            })
                    if ticks:
                        paper_engine.update_prices(ticks)
                        await websocket.send_text(json.dumps({"type": "price_tick", "data": ticks}))
                        # Check pending paper orders on each tick
                        try:
                            async with async_session() as pdb:
                                await paper_engine.check_pending_orders(pdb)
                        except Exception:
                            pass
                    await asyncio.sleep(1)
            except WebSocketDisconnect:
                pass
            return
        except Exception:
            log.exception("Kite WS failed, falling back to mock")

    if not universe_syms:
        universe_syms = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK"]
    try:
        while True:
            ticks = []
            for sym in random.sample(universe_syms, k=min(random.randint(3, 8), len(universe_syms))):
                ltp = generate_price(sym)
                change_pct = round(random.uniform(-2.5, 2.5), 2)
                ticks.append({
                    "symbol": sym, "ltp": ltp, "change_pct": change_pct,
                    "volume": random.randint(500_000, 10_000_000),
                })
            paper_engine.update_prices(ticks)
            await websocket.send_text(json.dumps({"type": "price_tick", "data": ticks}))
            try:
                async with async_session() as pdb:
                    await paper_engine.check_pending_orders(pdb)
            except Exception:
                pass
            await asyncio.sleep(1.5)
    except WebSocketDisconnect:
        pass
