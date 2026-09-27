from datetime import datetime, timedelta
from collections import defaultdict


def filter_candles_by_date(
    candles: list[dict], date_from: str | None, date_to: str | None
) -> list[dict]:
    if not candles or (not date_from and not date_to):
        return candles
    result = []
    for c in candles:
        d = c.get("date", "")[:10]
        if date_from and d < date_from:
            continue
        if date_to and d > date_to:
            continue
        result.append(c)
    return result


INTERVAL_MINUTES = {
    "minute": 1,
    "3minute": 3,
    "5minute": 5,
    "10minute": 10,
    "15minute": 15,
    "30minute": 30,
    "60minute": 60,
    "day": None,
}


def resample_daily_to_intraday(
    daily_candles: list[dict], interval: str
) -> list[dict]:
    """Synthesize intraday candles from daily data by splitting each day."""
    minutes = INTERVAL_MINUTES.get(interval)
    if minutes is None:
        return daily_candles

    market_minutes = 375
    bars_per_day = market_minutes // minutes
    result = []
    for candle in daily_candles:
        date_str = candle["date"][:10]
        o, h, l, c, v = candle["open"], candle["high"], candle["low"], candle["close"], candle.get("volume", 0)
        day_range = h - l
        if day_range == 0:
            day_range = 0.01
        bar_vol = max(1, v // bars_per_day)

        prev_close = o
        for i in range(bars_per_day):
            frac = (i + 1) / bars_per_day
            target = o + (c - o) * frac
            noise = day_range * 0.02 * (0.5 - (hash(f"{date_str}{i}") % 1000) / 1000)
            bar_close = round(target + noise, 2)
            bar_open = round(prev_close, 2)
            bar_high = round(max(bar_open, bar_close) + abs(noise) * 0.5, 2)
            bar_low = round(min(bar_open, bar_close) - abs(noise) * 0.5, 2)
            bar_high = min(bar_high, h)
            bar_low = max(bar_low, l)
            t_minutes = 9 * 60 + 15 + i * minutes
            t_h, t_m = divmod(t_minutes, 60)
            timestamp = f"{date_str} {t_h:02d}:{t_m:02d}:00"
            result.append({
                "date": timestamp,
                "open": bar_open,
                "high": bar_high,
                "low": bar_low,
                "close": bar_close,
                "volume": bar_vol,
            })
            prev_close = bar_close
    return result


def resample_to_higher_timeframe(
    candles: list[dict], target_interval: str, source_interval: str = "day"
) -> list[dict]:
    """Aggregate candles into a coarser timeframe (e.g. daily → weekly)."""
    src_min = INTERVAL_MINUTES.get(source_interval)
    tgt_min = INTERVAL_MINUTES.get(target_interval)
    if src_min is None or tgt_min is None:
        return candles
    if tgt_min <= src_min:
        return candles

    ratio = tgt_min // src_min
    result = []
    for i in range(0, len(candles), ratio):
        chunk = candles[i : i + ratio]
        if not chunk:
            break
        result.append({
            "date": chunk[0]["date"],
            "open": chunk[0]["open"],
            "high": max(c["high"] for c in chunk),
            "low": min(c["low"] for c in chunk),
            "close": chunk[-1]["close"],
            "volume": sum(c.get("volume", 0) for c in chunk),
        })
    return result


def prepare_candles(
    candles: list[dict],
    date_from: str | None = None,
    date_to: str | None = None,
    interval: str = "day",
) -> list[dict]:
    """Filter by date range, then convert to the requested interval."""
    filtered = filter_candles_by_date(candles, date_from, date_to)
    if not filtered:
        return filtered
    if interval == "day":
        return filtered
    is_daily = len(filtered[0].get("date", "")) <= 10 or " " not in filtered[0]["date"]
    if is_daily:
        return resample_daily_to_intraday(filtered, interval)
    return filtered
