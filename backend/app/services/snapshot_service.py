"""Daily snapshot engine: pull daily candles once/day, compute indicators, store.

Filters then read pre-computed values from the DB instead of recomputing or
using mocks. Falls back to mock candles when Kite is disconnected so the app
keeps working; the SnapshotRun row records which source was used.
"""
from __future__ import annotations

import asyncio
import json
from datetime import date, datetime, timedelta

from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.instrument import Instrument
from app.models.snapshot import DailyCandleStore, IntradayCandle, IndicatorSnapshot, SnapshotRun
from app.services.indicators import compute_indicators, compute_cross_sectional
from app.services.kite_service import kite_service
from app.services.event_log import log_event
from app.services.mock_data import generate_ohlcv
from app.services.universe import get_universe

LOOKBACK_DAYS = 400          # calendar days for an index snapshot request
HISTORY_DAYS = 5 * 366       # full one-time history (~5 years)
MOCK_CANDLES = 280           # trading candles when falling back to mock
KITE_THROTTLE_SEC = 0.34     # ~3 req/sec historical limit
TOPUP_BATCH = 400            # instruments per bulk quote/ohlc call (Kite max 500)

# Liquidity floor — stocks below this are flagged illiquid (_liquid=False) so
# screens can hide untradeable names. Configurable defaults.
MIN_PRICE = 20.0             # ₹
MIN_AVG_VOLUME_20D = 100_000  # shares

# Cross-sectional metrics that get a *_percentile companion (Tier 2).
_PERCENTILE_METRICS = [
    "return_5d", "return_20d", "return_60d", "return_120d",
    "rsi_14", "rvol", "volume_ratio_20d",
]


async def _resolve_full_universe(db: AsyncSession) -> list[dict]:
    """All NSE equities from the instruments table (excludes index rows).

    Index names like 'NIFTY 50' contain spaces; equity tradingsymbols don't,
    so we filter those out and require a token for the historical pull.
    """
    res = await db.execute(
        select(Instrument.symbol, Instrument.name, Instrument.instrument_token,
               Instrument.exchange, Instrument.sector)
        .where(Instrument.exchange == "NSE")
        .where(Instrument.instrument_token.isnot(None))
    )
    out = []
    for sym, name, tok, exch, sector in res.all():
        if " " in sym:
            continue
        out.append({"symbol": sym, "name": name or sym, "instrument_token": tok,
                    "exchange": exch or "NSE", "sector": sector or "", "index": []})
    return out


def _apply_liquidity(vals: dict, last_close: float | None) -> None:
    avg_vol = vals.get("volume_20d_avg")
    vals["_liquid"] = bool(
        last_close and last_close >= MIN_PRICE
        and avg_vol and avg_vol >= MIN_AVG_VOLUME_20D
    )


def _normalize_candle(row: dict) -> dict:
    d = row.get("date")
    return {
        "date": d.strftime("%Y-%m-%d") if isinstance(d, datetime) else str(d)[:10],
        "open": float(row["open"]),
        "high": float(row["high"]),
        "low": float(row["low"]),
        "close": float(row["close"]),
        "volume": int(row.get("volume", 0)),
    }


def _fetch_kite_candles(token: int, days: int = LOOKBACK_DAYS) -> list[dict]:
    to_d = datetime.now()
    from_d = to_d - timedelta(days=days)
    raw = kite_service.get_historical_data(token, from_d, to_d, "day")
    return [_normalize_candle(r) for r in raw]


async def has_snapshot(db: AsyncSession, on: date | None = None) -> bool:
    on = on or date.today()
    res = await db.execute(
        select(SnapshotRun.id).where(
            SnapshotRun.snapshot_date == on, SnapshotRun.status == "done"
        ).limit(1)
    )
    return res.first() is not None


async def latest_run(db: AsyncSession) -> SnapshotRun | None:
    res = await db.execute(select(SnapshotRun).order_by(SnapshotRun.id.desc()))
    return res.scalars().first()


async def get_stored_candles(db: AsyncSession, symbol: str) -> list[dict] | None:
    res = await db.execute(
        select(DailyCandleStore).where(DailyCandleStore.symbol == symbol)
    )
    row = res.scalar_one_or_none()
    return json.loads(row.candles) if row else None


async def get_snapshot_values(
    db: AsyncSession, symbols: set[str], on: date | None = None
) -> dict[str, dict]:
    on = on or date.today()
    res = await db.execute(
        select(IndicatorSnapshot).where(IndicatorSnapshot.snapshot_date == on)
    )
    out = {}
    for row in res.scalars().all():
        if row.symbol in symbols:
            out[row.symbol] = json.loads(row.values)
    return out


async def run_snapshot(
    db: AsyncSession,
    index: str = "NIFTY500",
    universe: list[dict] | None = None,
    history_days: int = LOOKBACK_DAYS,
    label: str | None = None,
    on_progress: callable | None = None,
) -> dict:
    """Pull → compute → store. `universe` overrides the index resolution (used
    by the full-universe history pull). `history_days` sets how far back to pull."""
    today = date.today()
    if universe is None:
        universe = await get_universe(db, index=index)
    label = label or index

    tokens = {s["symbol"]: s.get("instrument_token") for s in universe}
    if not any(tokens.values()):  # index universe carries no tokens itself
        tok_res = await db.execute(select(Instrument.symbol, Instrument.instrument_token))
        tokens = {sym: tok for sym, tok in tok_res.all()}

    connected = kite_service.is_connected
    run = SnapshotRun(
        snapshot_date=today, status="running", universe=label,
        source="kite" if connected else "mock", stocks_total=len(universe),
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    total = len(universe)
    src = "Kite" if connected else "mock"
    started = datetime.now()
    log_event(f"Snapshot started · {label} · {total} stocks · source={src} · {history_days}d history",
              source="snapshot", level="info")

    # clear today's prior rows (idempotent re-run)
    await db.execute(sa_delete(IndicatorSnapshot).where(IndicatorSnapshot.snapshot_date == today))
    await db.commit()

    all_values: dict[str, dict] = {}
    last_close: dict[str, float] = {}
    processed = 0
    loop = asyncio.get_event_loop()

    for s in universe:
        symbol = s["symbol"]
        if on_progress:
            on_progress(symbol)
        token = tokens.get(symbol)
        candles: list[dict] = []
        used = "mock"
        try:
            if connected and token:
                candles = await loop.run_in_executor(None, _fetch_kite_candles, token, history_days)
                used = "kite"
                await asyncio.sleep(KITE_THROTTLE_SEC)
        except Exception:
            candles = []
        if not candles:  # fallback / disconnected
            candles = generate_ohlcv(symbol, days=MOCK_CANDLES, interval="day")
            used = "mock"

        # store raw candles (for code strategies via the SDK)
        await db.execute(sa_delete(DailyCandleStore).where(DailyCandleStore.symbol == symbol))
        db.add(DailyCandleStore(symbol=symbol, candles=json.dumps(candles)))

        vals = compute_indicators(candles)
        lc = candles[-1]["close"] if candles else None
        _apply_liquidity(vals, lc)
        all_values[symbol] = vals
        last_close[symbol] = lc
        processed += 1
        log_event(f"[{processed}/{total}] {symbol} — {len(candles)} candles ({used})",
                  source="snapshot", level="info")
        if processed % 10 == 0:
            run.stocks_processed = processed
            await db.commit()

    # --- Tier 2: cross-sectional indicators (percentiles, RS, breadth) ---
    sector_map = {s["symbol"]: s.get("sector", "") for s in universe}
    all_values = compute_cross_sectional(all_values, sector_map=sector_map)

    # --- store computed indicator rows ---
    for symbol, vals in all_values.items():
        db.add(IndicatorSnapshot(
            snapshot_date=today, symbol=symbol,
            values=json.dumps(vals), ltp=last_close.get(symbol),
        ))
    run.stocks_processed = processed
    run.status = "done"
    run.finished_at = datetime.now()
    await db.commit()

    took = (datetime.now() - started).total_seconds()
    liquid = sum(1 for v in all_values.values() if v.get("_liquid"))
    log_event(f"Snapshot DONE · {label} · {processed} stocks ({liquid} liquid) · "
              f"source={src} · {took:.0f}s", source="snapshot", level="success")

    return {
        "date": str(today), "universe": label, "source": run.source,
        "stocks": processed, "status": "done",
    }


async def run_full_history(db: AsyncSession, on_progress: callable | None = None) -> dict:
    """One-time (or occasional) full pull: 5 years for the entire NSE equity
    universe. Heavy — ~30-45 min live. Reuses run_snapshot with the full list."""
    universe = await _resolve_full_universe(db)
    return await run_snapshot(
        db, universe=universe, history_days=HISTORY_DAYS, label="FULL_NSE",
        on_progress=on_progress,
    )


async def run_topup(db: AsyncSession, on_progress: callable | None = None) -> dict:
    """Daily fast refresh: append today's candle to already-stored series via
    Kite bulk OHLC (up to ~400 instruments/call), then recompute indicators.

    Only touches symbols that already have a stored history (from a prior full
    pull), so this is seconds, not minutes.
    """
    today = date.today()
    connected = kite_service.is_connected

    rows = (await db.execute(select(DailyCandleStore))).scalars().all()
    stored = {r.symbol: json.loads(r.candles) for r in rows}
    symbols = list(stored.keys())

    run = SnapshotRun(
        snapshot_date=today, status="running", universe="TOPUP",
        source="kite" if connected else "mock", stocks_total=len(symbols),
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    # exchange-qualified keys for the bulk OHLC call
    inst_res = await db.execute(
        select(Instrument.symbol, Instrument.exchange).where(Instrument.symbol.in_(symbols))
    )
    exch = {sym: ex or "NSE" for sym, ex in inst_res.all()}

    loop = asyncio.get_event_loop()
    today_str = today.strftime("%Y-%m-%d")

    if connected:
        for i in range(0, len(symbols), TOPUP_BATCH):
            batch = symbols[i:i + TOPUP_BATCH]
            keys = [f"{exch.get(s, 'NSE')}:{s}" for s in batch]
            try:
                data = await loop.run_in_executor(None, kite_service.get_ohlc, keys)
            except Exception:
                data = {}
            for s in batch:
                q = data.get(f"{exch.get(s, 'NSE')}:{s}")
                if not q or "ohlc" not in q:
                    continue
                o = q["ohlc"]
                candle = {
                    "date": today_str, "open": o.get("open", q.get("last_price")),
                    "high": o.get("high"), "low": o.get("low"),
                    "close": q.get("last_price", o.get("close")),
                    "volume": q.get("volume", 0),
                }
                series = stored[s]
                if series and series[-1]["date"] == today_str:
                    series[-1] = candle  # replace partial today candle
                else:
                    series.append(candle)

    # recompute + store
    all_values, last_close = {}, {}
    processed = 0
    for s in symbols:
        if on_progress:
            on_progress(s)
        series = stored[s]
        await db.execute(sa_delete(DailyCandleStore).where(DailyCandleStore.symbol == s))
        db.add(DailyCandleStore(symbol=s, candles=json.dumps(series)))
        vals = compute_indicators(series)
        lc = series[-1]["close"] if series else None
        _apply_liquidity(vals, lc)
        all_values[s] = vals
        last_close[s] = lc
        processed += 1
        if processed % 50 == 0:
            run.stocks_processed = processed
            await db.commit()

    # Tier 2: cross-sectional
    inst_sec_res = await db.execute(
        select(Instrument.symbol, Instrument.sector).where(Instrument.symbol.in_(symbols))
    )
    sector_map = {sym: sec or "" for sym, sec in inst_sec_res.all()}
    all_values = compute_cross_sectional(all_values, sector_map=sector_map)

    await db.execute(sa_delete(IndicatorSnapshot).where(IndicatorSnapshot.snapshot_date == today))
    for sym, vals in all_values.items():
        db.add(IndicatorSnapshot(snapshot_date=today, symbol=sym,
                                 values=json.dumps(vals), ltp=last_close.get(sym)))
    run.stocks_processed = processed
    run.status = "done"
    run.finished_at = datetime.now()
    await db.commit()
    return {"date": str(today), "universe": "TOPUP", "source": run.source,
            "stocks": processed, "status": "done"}


# ---------------------------------------------------------------------------
# Intraday candle pull (5-minute, accumulating)
# ---------------------------------------------------------------------------

INTRADAY_INTERVAL = "5minute"
INTRADAY_LOOKBACK_DAYS = 100  # Kite max for 5minute

def _fetch_kite_intraday(token: int, interval: str = INTRADAY_INTERVAL,
                          days: int = INTRADAY_LOOKBACK_DAYS) -> list[dict]:
    to_d = datetime.now()
    from_d = to_d - timedelta(days=days)
    raw = kite_service.get_historical_data(token, from_d, to_d, interval)
    out = []
    for r in raw:
        d = r.get("date")
        out.append({
            "timestamp": d if isinstance(d, datetime) else datetime.fromisoformat(str(d)),
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "volume": int(r.get("volume", 0)),
        })
    return out


async def run_intraday_pull(
    db: AsyncSession,
    interval: str = INTRADAY_INTERVAL,
    on_progress: callable | None = None,
) -> dict:
    """Pull intraday candles for ALL NSE equities. Merges with existing data
    (upsert on symbol+interval+timestamp) so history accumulates over time."""
    universe = await _resolve_full_universe(db)
    total = len(universe)

    run = SnapshotRun(
        snapshot_date=date.today(), status="running", universe="INTRADAY_ALL",
        source="kite" if kite_service.is_connected else "mock",
        stocks_total=total,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    if not kite_service.is_connected:
        run.status = "failed"
        run.error = "Kite not connected"
        run.finished_at = datetime.now()
        await db.commit()
        return {"status": "failed", "error": "Kite not connected"}

    started = datetime.now()
    log_event(f"Intraday pull started · {interval} · {total} stocks",
              source="snapshot", level="info")

    processed = 0
    errors = 0
    loop = asyncio.get_event_loop()

    for s in universe:
        symbol = s["symbol"]
        token = s.get("instrument_token")
        if on_progress:
            on_progress(symbol)
        if not token:
            processed += 1
            continue
        try:
            candles = await loop.run_in_executor(
                None, _fetch_kite_intraday, token, interval, INTRADAY_LOOKBACK_DAYS
            )
            await asyncio.sleep(KITE_THROTTLE_SEC)
        except Exception as exc:
            log_event(f"Intraday error {symbol}: {exc}", source="snapshot", level="warning")
            errors += 1
            processed += 1
            continue

        if candles:
            # Batch upsert: delete existing candles in the fetched range, then insert
            min_ts = candles[0]["timestamp"]
            max_ts = candles[-1]["timestamp"]
            await db.execute(
                sa_delete(IntradayCandle).where(
                    IntradayCandle.symbol == symbol,
                    IntradayCandle.interval == interval,
                    IntradayCandle.timestamp >= min_ts,
                    IntradayCandle.timestamp <= max_ts,
                )
            )
            for c in candles:
                db.add(IntradayCandle(
                    symbol=symbol, interval=interval, timestamp=c["timestamp"],
                    open=c["open"], high=c["high"], low=c["low"],
                    close=c["close"], volume=c["volume"],
                ))

        processed += 1
        if processed % 10 == 0:
            run.stocks_processed = processed
            await db.commit()
            log_event(f"[{processed}/{total}] {symbol} — {len(candles)} intraday candles",
                      source="snapshot", level="info")

    run.stocks_processed = processed
    run.status = "done"
    run.finished_at = datetime.now()
    await db.commit()

    took = (datetime.now() - started).total_seconds()
    log_event(f"Intraday pull DONE · {interval} · {processed} stocks · {errors} errors · {took:.0f}s",
              source="snapshot", level="success")

    return {"status": "done", "interval": interval, "stocks": processed,
            "errors": errors, "seconds": int(took)}


async def get_intraday_summary(db: AsyncSession) -> dict:
    """Stats for the Historical Data modal — counts and date ranges per interval."""
    from sqlalchemy import func as sa_func

    res = await db.execute(
        select(
            IntradayCandle.symbol,
            IntradayCandle.interval,
            sa_func.count(IntradayCandle.id).label("cnt"),
            sa_func.min(IntradayCandle.timestamp).label("first_ts"),
            sa_func.max(IntradayCandle.timestamp).label("last_ts"),
        ).group_by(IntradayCandle.symbol, IntradayCandle.interval)
    )
    rows = res.all()
    symbols = {}
    for sym, interval, cnt, first_ts, last_ts in rows:
        symbols[sym] = {
            "symbol": sym, "interval": interval,
            "candle_count": cnt,
            "first_date": str(first_ts)[:16] if first_ts else None,
            "last_date": str(last_ts)[:16] if last_ts else None,
        }

    total_candles = sum(s["candle_count"] for s in symbols.values())
    return {
        "total_symbols": len(symbols),
        "total_candles": total_candles,
        "symbols": sorted(symbols.values(), key=lambda x: x["symbol"]),
    }
