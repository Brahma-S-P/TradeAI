"""DB-backed stock universe queries.

All universe resolution goes through here — no hardcoded stock lists.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.instrument import Instrument, IndexMember


async def get_universe(
    db: AsyncSession,
    index: str | None = None,
    industry: str | None = None,
) -> list[dict]:
    query = select(Instrument).where(Instrument.exchange == "NSE")

    if industry and industry not in ("All", ""):
        query = query.where(Instrument.industry == industry)

    if index and index not in ("ALL", ""):
        subq = select(IndexMember.symbol).where(
            IndexMember.index_name == index, IndexMember.active == True
        )
        query = query.where(Instrument.symbol.in_(subq))

    query = query.order_by(Instrument.symbol)
    result = await db.execute(query)
    instruments = result.scalars().all()

    idx_res = await db.execute(
        select(IndexMember.symbol, IndexMember.index_name).where(IndexMember.active == True)
    )
    idx_map: dict[str, list[str]] = {}
    for sym, idx_name in idx_res.all():
        idx_map.setdefault(sym, []).append(idx_name)

    return [
        {
            "symbol": i.symbol,
            "name": i.name or i.symbol,
            "sector": i.industry or i.sector or "",
            "industry": i.industry or "",
            "exchange": i.exchange or "NSE",
            "instrument_token": i.instrument_token,
            "index": idx_map.get(i.symbol, []),
        }
        for i in instruments
    ]


async def get_symbols_for_index(db: AsyncSession, index: str) -> set[str]:
    if not index or index in ("ALL", ""):
        result = await db.execute(select(Instrument.symbol))
        return {r[0] for r in result.all()}
    result = await db.execute(
        select(IndexMember.symbol).where(
            IndexMember.index_name == index, IndexMember.active == True
        )
    )
    return {r[0] for r in result.all()}


async def get_symbol_info(db: AsyncSession, symbol: str) -> dict | None:
    result = await db.execute(select(Instrument).where(Instrument.symbol == symbol))
    i = result.scalar_one_or_none()
    if not i:
        return None
    return {
        "symbol": i.symbol,
        "name": i.name or i.symbol,
        "sector": i.industry or i.sector or "",
        "exchange": i.exchange or "NSE",
        "instrument_token": i.instrument_token,
    }
