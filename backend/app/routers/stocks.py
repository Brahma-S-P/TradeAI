import json
import time as _time
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import delete as sa_delete

from app.core.database import get_db
from app.models.batch import Batch
from app.models.instrument import Instrument, IndexMember
from app.models.snapshot import DailyCandleStore
from app.services.kite_service import kite_service
from app.services.mock_data import generate_ohlcv, generate_price, PRICE_RANGES
from app.services.universe import get_universe, get_symbols_for_index
from app.services.strategy_runner import (
    run_manual_strategy,
    run_code_strategy,
)
from app.services import snapshot_service
from app.services.event_log import log_event

router = APIRouter(prefix="/api/stocks", tags=["stocks"])
# batch screener includes instrument-backed symbols


@router.get("/universe")
async def get_stock_universe(db: AsyncSession = Depends(get_db)):
    return await get_universe(db)


def _fetch_all_eq_instruments() -> list[dict]:
    seen: dict[str, dict] = {}
    for exchange in ("NSE", "BSE"):
        try:
            instruments = kite_service.get_instruments(exchange)
            for i in instruments:
                if i.get("instrument_type") != "EQ":
                    continue
                sym = i["tradingsymbol"]
                if sym not in seen:
                    i["exchange"] = exchange
                    seen[sym] = i
        except Exception:
            pass
    return list(seen.values())


@router.post("/sync-instruments")
async def sync_instruments(db: AsyncSession = Depends(get_db)):
    if not kite_service.is_connected:
        return {"error": "Kite not connected", "count": 0}
    try:
        all_eq = _fetch_all_eq_instruments()

        existing = {}
        res = await db.execute(select(Instrument))
        for i in res.scalars().all():
            existing[i.symbol] = i

        updated = 0
        created = 0
        for i in all_eq:
            sym = i["tradingsymbol"]
            if sym in existing:
                existing[sym].instrument_token = i.get("instrument_token")
                existing[sym].name = i.get("name", sym)
                updated += 1
            else:
                db.add(Instrument(
                    symbol=sym,
                    name=i.get("name", sym),
                    exchange=i.get("exchange", "NSE"),
                    instrument_token=i.get("instrument_token"),
                ))
                created += 1
        await db.commit()
        return {"ok": True, "updated": updated, "created": created, "total": len(all_eq)}
    except Exception as e:
        return {"error": str(e), "count": 0}


@router.get("/quotes")
async def get_quotes(symbols: str | None = None, db: AsyncSession = Depends(get_db)):
    symbol_list = symbols.split(",") if symbols else None
    if not kite_service.is_connected:
        return {"quotes": _mock_quotes(symbol_list), "source": "mock"}
    try:
        if not symbol_list:
            universe = await get_universe(db, index="NIFTY500")
            symbol_list = [s["symbol"] for s in universe]
        instruments = [f"NSE:{s}" for s in symbol_list]
        quotes = kite_service.get_quote(instruments)
        result = []
        for key, q in quotes.items():
            sym = key.split(":")[1]
            ohlc = q.get("ohlc", {})
            result.append({
                "symbol": sym,
                "ltp": q.get("last_price", 0),
                "open": ohlc.get("open", 0),
                "high": ohlc.get("high", 0),
                "low": ohlc.get("low", 0),
                "close": ohlc.get("close", 0),
                "volume": q.get("volume", 0),
                "change_pct": round(
                    ((q.get("last_price", 0) - ohlc.get("close", 1)) / max(ohlc.get("close", 1), 1)) * 100, 2
                ),
                "buy_quantity": q.get("buy_quantity", 0),
                "sell_quantity": q.get("sell_quantity", 0),
                "last_quantity": q.get("last_trade_time") and q.get("last_quantity", 0) or 0,
                "average_price": q.get("average_price", 0),
                "oi": q.get("oi", 0),
                "depth": q.get("depth", {}),
            })
        return {"quotes": result, "source": "kite"}
    except Exception as exc:
        log_event(f"Kite quote failed ({exc.__class__.__name__}), using mock data", "kite", "warn")
        return {"quotes": _mock_quotes(symbol_list), "source": "mock"}


def _mock_quotes(symbols: list[str] | None = None) -> list[dict]:
    import random
    syms = symbols or []
    quotes = []
    for sym in syms:
        ltp = generate_price(sym)
        prev_close = ltp * (1 + random.uniform(-0.03, 0.03))
        change = ltp - prev_close
        quotes.append({
            "symbol": sym, "name": sym, "sector": "",
            "ltp": round(ltp, 2), "change": round(change, 2),
            "change_pct": round((change / prev_close) * 100, 2),
            "volume": random.randint(500_000, 10_000_000),
            "high": round(ltp * 1.015, 2), "low": round(ltp * 0.985, 2),
            "open": round(ltp * (1 + random.uniform(-0.01, 0.01)), 2),
        })
    return quotes


@router.get("/{symbol}/ohlcv")
async def get_ohlcv(
    symbol: str, days: int = 90, interval: str = "day",
    db: AsyncSession = Depends(get_db),
):
    sym = symbol.upper()
    if not kite_service.is_connected:
        if interval in ("day", ""):
            res = await db.execute(
                select(DailyCandleStore.candles).where(DailyCandleStore.symbol == sym)
            )
            raw = res.scalar_one_or_none()
            if raw:
                all_candles = json.loads(raw)
                if all_candles:
                    return {"candles": all_candles[-days:], "source": "stored"}
        return {"candles": generate_ohlcv(sym, days, interval), "source": "mock"}
    try:
        result = await db.execute(
            select(Instrument.instrument_token).where(Instrument.symbol == sym)
        )
        token = result.scalar_one_or_none()

        if not token:
            instruments = kite_service.get_instruments("NSE")
            for i in instruments:
                if i["tradingsymbol"] == sym and i.get("instrument_type") == "EQ":
                    token = i["instrument_token"]
                    break
        if not token:
            log_event(f"No instrument token for {sym}, using mock", "kite", "warn")
            return {"candles": generate_ohlcv(sym, days, interval), "source": "mock"}

        to_date = datetime.now()
        if interval == "minute":
            from_date = to_date.replace(hour=9, minute=15, second=0, microsecond=0)
        else:
            from_date = to_date - timedelta(days=days)
        data = kite_service.get_historical_data(token, from_date, to_date, interval)
        return {
            "candles": [
                {
                    "date": str(d["date"]),
                    "open": d["open"],
                    "high": d["high"],
                    "low": d["low"],
                    "close": d["close"],
                    "volume": d["volume"],
                }
                for d in data
            ],
            "source": "kite",
        }
    except Exception as exc:
        log_event(f"Kite OHLCV failed for {sym} ({exc.__class__.__name__}), trying stored", "kite", "warn")
        if interval in ("day", ""):
            res2 = await db.execute(
                select(DailyCandleStore.candles).where(DailyCandleStore.symbol == sym)
            )
            raw2 = res2.scalar_one_or_none()
            if raw2:
                all_candles = json.loads(raw2)
                if all_candles:
                    return {"candles": all_candles[-days:], "source": "stored"}
        return {"candles": generate_ohlcv(sym, days, interval), "source": "mock"}


@router.get("/{symbol}/metrics")
async def get_metrics(symbol: str, db: AsyncSession = Depends(get_db)):
    sym = symbol.upper()
    vals = await snapshot_service.get_snapshot_values(db, {sym})
    v = vals.get(sym, {})
    ltp = v.get("close") or generate_price(sym)
    import random
    return {
        "symbol": sym,
        "ltp": ltp,
        "rsi_14": v.get("rsi_14", round(random.uniform(20, 80), 1)),
        "sma_20": v.get("sma_20", round(ltp * random.uniform(0.95, 1.05), 2)),
        "sma_50": v.get("sma_50", round(ltp * random.uniform(0.90, 1.10), 2)),
        "sma_200": v.get("sma_200", round(ltp * random.uniform(0.80, 1.20), 2)),
        "ema_12": v.get("ema_12", round(ltp * random.uniform(0.97, 1.03), 2)),
        "ema_26": v.get("ema_26", round(ltp * random.uniform(0.95, 1.05), 2)),
        "macd": v.get("macd", round(random.uniform(-5, 5), 2)),
        "atr_14": v.get("atr_14", round(ltp * random.uniform(0.01, 0.04), 2)),
        "volume_20d_avg": v.get("volume_20d_avg", random.randint(500_000, 10_000_000)),
        "beta": v.get("beta", round(random.uniform(0.5, 1.8), 2)),
    }


@router.get("/screener")
async def get_screener(
    index: str | None = None,
    sector: str | None = None,
    price_min: float | None = None,
    price_max: float | None = None,
    volume_min: int | None = None,
    change_min: float | None = None,
    change_max: float | None = None,
    volatility_period: str = "daily",
    sort_by: str = "symbol",
    sort_dir: str = "asc",
    db: AsyncSession = Depends(get_db),
):
    batch_symbols: set[str] | None = None
    effective_index = index
    if index and index.startswith("BATCH:"):
        batch_id = int(index.split(":", 1)[1])
        result = await db.execute(select(Batch).where(Batch.id == batch_id))
        batch = result.scalar_one_or_none()
        if batch:
            batch_symbols = {s.strip() for s in batch.symbols.split(",") if s.strip()}
        effective_index = None

    if not kite_service.is_connected:
        stocks = await _resolve_screener_universe(db, effective_index, sector, batch_symbols)
        return _generate_screener_rows(
            stocks, price_min=price_min, price_max=price_max,
            volume_min=volume_min, change_min=change_min, change_max=change_max,
            volatility_period=volatility_period, sort_by=sort_by, sort_dir=sort_dir,
        )
    try:
        return await _live_screener(
            db=db, index=effective_index, sector=sector,
            price_min=price_min, price_max=price_max,
            volume_min=volume_min, change_min=change_min, change_max=change_max,
            sort_by=sort_by, sort_dir=sort_dir,
            batch_symbols=batch_symbols,
        )
    except Exception:
        stocks = await _resolve_screener_universe(db, effective_index, sector, batch_symbols)
        return _generate_screener_rows(
            stocks, price_min=price_min, price_max=price_max,
            volume_min=volume_min, change_min=change_min, change_max=change_max,
            volatility_period=volatility_period, sort_by=sort_by, sort_dir=sort_dir,
        )


async def _resolve_screener_universe(
    db: AsyncSession, index: str | None, sector: str | None,
    batch_symbols: set[str] | None,
) -> list[dict]:
    if batch_symbols is not None:
        result = await db.execute(
            select(Instrument).where(Instrument.symbol.in_(batch_symbols))
        )
        instruments = result.scalars().all()
        idx_res = await db.execute(
            select(IndexMember.symbol, IndexMember.index_name).where(IndexMember.active == True)
        )
        idx_map: dict[str, list[str]] = {}
        for sym, idx_name in idx_res.all():
            idx_map.setdefault(sym, []).append(idx_name)
        return [
            {"symbol": i.symbol, "name": i.name or i.symbol,
             "sector": i.industry or i.sector or "", "exchange": i.exchange or "NSE",
             "index": idx_map.get(i.symbol, [])}
            for i in instruments
        ]
    return await get_universe(db, index=index or "NIFTY500", industry=sector)


def _generate_screener_rows(
    stocks: list[dict],
    price_min: float | None = None, price_max: float | None = None,
    volume_min: int | None = None,
    change_min: float | None = None, change_max: float | None = None,
    volatility_period: str = "daily",
    sort_by: str = "symbol", sort_dir: str = "asc",
) -> list[dict]:
    import random
    rows = []
    for s in stocks:
        ltp = generate_price(s["symbol"])
        prev_close = ltp * (1 + random.uniform(-0.04, 0.04))
        change_pct = round(((ltp - prev_close) / prev_close) * 100, 2)
        volume = random.randint(500_000, 15_000_000)
        if volatility_period == "weekly":
            volatility = round(random.uniform(1.5, 10.0), 2)
        elif volatility_period == "monthly":
            volatility = round(random.uniform(3.0, 20.0), 2)
        else:
            volatility = round(random.uniform(0.8, 5.5), 2)
        avg_volume_20d = random.randint(800_000, 12_000_000)
        vol_ratio = round(volume / avg_volume_20d, 2)
        rsi = round(random.uniform(20, 80), 1)
        week52_high = round(ltp * random.uniform(1.05, 1.40), 2)
        week52_low = round(ltp * random.uniform(0.55, 0.92), 2)
        market_cap_cr = random.randint(5000, 500000)

        if price_min is not None and ltp < price_min:
            continue
        if price_max is not None and ltp > price_max:
            continue
        if volume_min is not None and volume < volume_min:
            continue
        if change_min is not None and change_pct < change_min:
            continue
        if change_max is not None and change_pct > change_max:
            continue

        rows.append({
            "symbol": s["symbol"], "name": s.get("name", s["symbol"]),
            "sector": s.get("sector", ""), "exchange": s.get("exchange", "NSE"),
            "index": s.get("index", []),
            "ltp": ltp, "change_pct": change_pct, "volume": volume,
            "avg_volume_20d": avg_volume_20d, "vol_ratio": vol_ratio,
            "volatility": volatility, "day_range_pct": round(random.uniform(0.5, 4.0), 2),
            "rsi": rsi, "week52_high": week52_high, "week52_low": week52_low,
            "market_cap_cr": market_cap_cr,
        })

    reverse = sort_dir == "desc"
    if sort_by in ("ltp", "change_pct", "volume", "volatility", "vol_ratio", "rsi", "market_cap_cr"):
        rows.sort(key=lambda r: r.get(sort_by, 0), reverse=reverse)
    else:
        rows.sort(key=lambda r: r.get("symbol", ""), reverse=reverse)
    return rows


_instruments_cache: dict = {"data": None, "ts": 0}

def _get_nse_instruments() -> list[dict]:
    now = _time.time()
    if _instruments_cache["data"] and now - _instruments_cache["ts"] < 86400:
        return _instruments_cache["data"]
    instruments = kite_service.get_instruments("NSE")
    eq = [i for i in instruments if i.get("instrument_type") == "EQ" and i.get("segment") == "NSE"]
    _instruments_cache["data"] = eq
    _instruments_cache["ts"] = now
    return eq


async def _live_screener(
    db: AsyncSession,
    index: str | None = None,
    sector: str | None = None,
    price_min: float | None = None,
    price_max: float | None = None,
    volume_min: int | None = None,
    change_min: float | None = None,
    change_max: float | None = None,
    sort_by: str = "symbol",
    sort_dir: str = "asc",
    batch_symbols: set[str] | None = None,
) -> list[dict]:
    instruments = _get_nse_instruments()

    if batch_symbols is not None:
        instruments = [i for i in instruments if i["tradingsymbol"] in batch_symbols]
    elif index and index != "ALL":
        allowed = await get_symbols_for_index(db, index)
        instruments = [i for i in instruments if i["tradingsymbol"] in allowed]

    if not instruments:
        return []

    inst_lookup = {}
    syms = [i["tradingsymbol"] for i in instruments]
    res = await db.execute(select(Instrument).where(Instrument.symbol.in_(syms)))
    for i in res.scalars().all():
        inst_lookup[i.symbol] = i

    idx_res = await db.execute(
        select(IndexMember.symbol, IndexMember.index_name).where(IndexMember.active == True)
    )
    idx_map: dict[str, list[str]] = {}
    for sym, idx_name in idx_res.all():
        idx_map.setdefault(sym, []).append(idx_name)

    batch_size = 500
    all_quotes: dict = {}
    for i in range(0, len(instruments), batch_size):
        batch = instruments[i:i + batch_size]
        keys = [f"NSE:{inst['tradingsymbol']}" for inst in batch]
        try:
            quotes = kite_service.get_quote(keys)
            all_quotes.update(quotes)
        except Exception:
            pass

    rows = []
    for inst in instruments:
        sym = inst["tradingsymbol"]
        key = f"NSE:{sym}"
        q = all_quotes.get(key)
        if not q or not q.get("last_price"):
            continue

        ltp = q["last_price"]
        ohlc = q.get("ohlc", {})
        prev_close = ohlc.get("close", ltp)
        change_pct = round(((ltp - prev_close) / prev_close) * 100, 2) if prev_close else 0
        volume = q.get("volume", 0)
        avg_volume_20d = q.get("average_price", 0)
        day_high = ohlc.get("high", ltp)
        day_low = ohlc.get("low", ltp)
        day_range_pct = round(((day_high - day_low) / ltp) * 100, 2) if ltp else 0

        db_inst = inst_lookup.get(sym)
        stock_sector = (db_inst.industry or db_inst.sector) if db_inst else ""
        stock_name = (db_inst.name or sym) if db_inst else inst.get("name", sym)

        if sector and sector != "All" and stock_sector != sector:
            continue
        if price_min is not None and ltp < price_min:
            continue
        if price_max is not None and ltp > price_max:
            continue
        if volume_min is not None and volume < volume_min:
            continue
        if change_min is not None and change_pct < change_min:
            continue
        if change_max is not None and change_pct > change_max:
            continue

        vol_ratio = round(volume / avg_volume_20d, 2) if avg_volume_20d else 0
        rows.append({
            "symbol": sym, "name": stock_name, "sector": stock_sector,
            "exchange": inst.get("exchange", "NSE"),
            "index": idx_map.get(sym, []),
            "ltp": ltp, "change_pct": change_pct,
            "volume": volume, "avg_volume_20d": int(avg_volume_20d) if avg_volume_20d else 0,
            "vol_ratio": vol_ratio, "volatility": day_range_pct,
            "day_range_pct": day_range_pct, "rsi": 0,
            "week52_high": ohlc.get("high", ltp),
            "week52_low": ohlc.get("low", ltp),
            "market_cap_cr": 0,
        })

    reverse = sort_dir == "desc"
    if sort_by in ("ltp", "change_pct", "volume", "volatility", "vol_ratio", "rsi", "market_cap_cr"):
        rows.sort(key=lambda r: r.get(sort_by, 0), reverse=reverse)
    else:
        rows.sort(key=lambda r: r.get("symbol", ""), reverse=reverse)
    return rows


class ManualRunRequest(BaseModel):
    filters: list[dict]
    index: str | None = None
    sector: str | None = None


class CodeRunRequest(BaseModel):
    code: str
    index: str | None = None


async def _resolve_run_candidates(index: str | None, db: AsyncSession) -> list[dict]:
    if index and index.startswith("BATCH:"):
        batch_id = int(index.split(":", 1)[1])
        result = await db.execute(select(Batch).where(Batch.id == batch_id))
        batch = result.scalar_one_or_none()
        if not batch:
            return []
        symbols = {s.strip() for s in batch.symbols.split(",") if s.strip()}
        inst_result = await db.execute(
            select(Instrument).where(Instrument.symbol.in_(symbols))
        )
        return [
            {"symbol": i.symbol, "name": i.name or i.symbol,
             "sector": i.industry or i.sector or "", "exchange": i.exchange or "NSE", "index": []}
            for i in inst_result.scalars().all()
        ]
    return await get_universe(db, index=index or "NIFTY500")


@router.post("/picker/run/manual")
async def run_picker_manual(payload: ManualRunRequest, db: AsyncSession = Depends(get_db)):
    candidates = await _resolve_run_candidates(payload.index, db)
    total_before_sector = len(candidates)
    if payload.sector and payload.sector != "All":
        candidates = [s for s in candidates if s["sector"] == payload.sector]
    symbols = {c["symbol"] for c in candidates}
    values = await snapshot_service.get_snapshot_values(db, symbols)

    sectors = {}
    for c in candidates:
        s = c.get("sector", "Unknown")
        sectors[s] = sectors.get(s, 0) + 1
    top_sectors = sorted(sectors.items(), key=lambda x: -x[1])[:5]
    sector_str = ", ".join(f"{k}({v})" for k, v in top_sectors)

    flt = ", ".join(f.get("id", "?") for f in payload.filters) or "none"
    log_event(
        f"Manual run · universe: {payload.index or 'NIFTY500'} "
        f"· {total_before_sector} stocks"
        + (f" → {len(candidates)} after sector filter '{payload.sector}'" if payload.sector and payload.sector != "All" else "")
        + f" · {len(values)}/{len(candidates)} with snapshot data"
        + f" · filters: {flt} ({len(payload.filters)} active)",
        source="picker", level="info",
    )
    log_event(f"  sectors: {sector_str}", source="picker", level="info")

    stats: dict = {}
    t0 = _time.perf_counter()
    results = run_manual_strategy(candidates, payload.filters, values, stats)
    took = (_time.perf_counter() - t0) * 1000

    processed = stats.get("processed", len(candidates))
    matched = stats.get("matched", len(results))
    pct = round(matched / processed * 100, 1) if processed else 0
    live = stats.get("live_data", 0)
    mock_count = processed - live
    log_event(
        f"Manual run DONE · scanned {processed} · passed {matched}/{processed} ({pct}%) · "
        f"{took:.0f}ms · data: {live} snapshot + {mock_count} mock",
        source="picker", level="success",
    )
    if stats.get("per_filter"):
        for fid, count in stats["per_filter"].items():
            fpct = round(count / processed * 100, 1) if processed else 0
            log_event(f"  filter '{fid}': {count}/{processed} passed ({fpct}%)", source="picker", level="info")
    return results


@router.post("/picker/run/code")
async def run_picker_code(payload: CodeRunRequest, db: AsyncSession = Depends(get_db)):
    candidates = await _resolve_run_candidates(payload.index, db)
    candles: dict[str, list] = {}
    candle_lengths: list[int] = []
    for c in candidates:
        stored = await snapshot_service.get_stored_candles(db, c["symbol"])
        if stored:
            candles[c["symbol"]] = stored
            candle_lengths.append(len(stored))
    live = len(candles)
    mock_count = len(candidates) - live
    avg_candles = round(sum(candle_lengths) / len(candle_lengths)) if candle_lengths else 0
    min_candles = min(candle_lengths) if candle_lengths else 0
    max_candles = max(candle_lengths) if candle_lengths else 0

    sectors = {}
    for c in candidates:
        s = c.get("sector", "Unknown")
        sectors[s] = sectors.get(s, 0) + 1

    log_event(
        f"Code run · universe: {payload.index or 'NIFTY500'} · {len(candidates)} stocks "
        f"· {len(sectors)} sectors · data: {live} stored + {mock_count} mock",
        source="picker", level="info",
    )
    if candle_lengths:
        log_event(
            f"  candle history: {min_candles}–{max_candles} days (avg {avg_candles})",
            source="picker", level="info",
        )

    t0 = _time.perf_counter()
    try:
        results = run_code_strategy(payload.code, candidates, candles)
        took = (_time.perf_counter() - t0) * 1000
        n = len(candidates)
        matched = len(results) if isinstance(results, list) else 0
        pct = round(matched / n * 100, 1) if n else 0
        log_event(
            f"Code run DONE · scanned {n} · passed {matched}/{n} ({pct}%) · {took:.0f}ms",
            source="picker", level="success",
        )
        if matched and isinstance(results, list):
            syms = [r.get("symbol", "?") for r in results[:10]]
            log_event(f"  top picks: {', '.join(syms)}" + (" ..." if matched > 10 else ""),
                      source="picker", level="info")
        return results
    except ValueError as e:
        log_event(f"Code run FAILED · {e}", source="picker", level="error")
        return {"error": str(e)}


@router.get("/picker/run")
async def run_stock_picker(db: AsyncSession = Depends(get_db)):
    import random
    stocks = await get_universe(db, index="NIFTY500")
    picked = random.sample(stocks, k=min(8, len(stocks)))
    return [
        {"symbol": s["symbol"], "name": s["name"], "sector": s["sector"],
         "price": generate_price(s["symbol"]),
         "matched_criteria": "Default scan", "timestamp": datetime.now().isoformat()}
        for s in picked
    ]


class SeedRequest(BaseModel):
    nifty500_csv: str
    nifty200_csv: str | None = None
    nifty50_csv: str | None = None


@router.post("/seed-universe")
async def seed_universe(body: SeedRequest, db: AsyncSession = Depends(get_db)):
    """Seed instruments and index membership from CSV files on disk."""
    import csv
    from pathlib import Path

    stats = {"instruments_created": 0, "instruments_updated": 0, "indices_set": 0}

    def read_csv(path: str) -> list[dict]:
        p = Path(path)
        if not p.exists():
            return []
        with open(p, encoding="utf-8") as f:
            return list(csv.DictReader(f))

    n500_rows = read_csv(body.nifty500_csv)
    if not n500_rows:
        return {"error": f"Could not read {body.nifty500_csv}"}

    n200_syms = set()
    n50_syms = set()
    if body.nifty200_csv:
        for r in read_csv(body.nifty200_csv):
            n200_syms.add(r["symbol"].strip())
    if body.nifty50_csv:
        for r in read_csv(body.nifty50_csv):
            n50_syms.add(r["symbol"].strip())

    res = await db.execute(select(Instrument))
    existing = {i.symbol: i for i in res.scalars().all()}

    for row in n500_rows:
        sym = row["symbol"].strip()
        name = row.get("company_name", "").replace(" Ltd.", "").replace(" Limited", "").strip()
        industry = row.get("industry", "").strip()
        isin = row.get("isin", "").strip() or None
        series = row.get("series", "EQ").strip()

        if sym in existing:
            inst = existing[sym]
            inst.name = name or inst.name
            inst.industry = industry
            inst.sector = industry
            if isin:
                inst.isin = isin
            inst.series = series
            stats["instruments_updated"] += 1
        else:
            inst = Instrument(
                symbol=sym, name=name, exchange="NSE",
                industry=industry, sector=industry,
                isin=isin, series=series,
            )
            db.add(inst)
            stats["instruments_created"] += 1

    await db.flush()

    await db.execute(sa_delete(IndexMember))

    members = []
    for row in n500_rows:
        sym = row["symbol"].strip()
        members.append(IndexMember(symbol=sym, index_name="NIFTY500"))
        if sym in n200_syms:
            members.append(IndexMember(symbol=sym, index_name="NIFTY200"))
        if sym in n50_syms:
            members.append(IndexMember(symbol=sym, index_name="NIFTY50"))

    db.add_all(members)
    stats["indices_set"] = len(members)

    await db.commit()

    return stats


@router.get("/universe-db")
async def get_universe_from_db(
    index: str | None = None,
    industry: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Query instruments + index membership from DB."""
    query = select(Instrument).where(Instrument.exchange == "NSE")

    if industry and industry != "All":
        query = query.where(Instrument.industry == industry)

    if index and index not in ("ALL", ""):
        subq = select(IndexMember.symbol).where(IndexMember.index_name == index, IndexMember.active == True)
        query = query.where(Instrument.symbol.in_(subq))

    query = query.order_by(Instrument.symbol)
    result = await db.execute(query)
    instruments = result.scalars().all()

    idx_res = await db.execute(select(IndexMember.symbol, IndexMember.index_name).where(IndexMember.active == True))
    idx_map: dict[str, list[str]] = {}
    for sym, idx_name in idx_res.all():
        idx_map.setdefault(sym, []).append(idx_name)

    return [
        {
            "symbol": i.symbol,
            "name": i.name,
            "sector": i.industry or i.sector,
            "industry": i.industry,
            "isin": i.isin,
            "exchange": i.exchange,
            "instrument_token": i.instrument_token,
            "index": idx_map.get(i.symbol, []),
        }
        for i in instruments
    ]
