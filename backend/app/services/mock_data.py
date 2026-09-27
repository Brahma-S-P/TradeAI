"""Minimal mock data generators for price/OHLCV fallback when Kite is disconnected.

The stock universe is in the database (instruments + index_members tables).
These functions only generate synthetic price data for display purposes.
"""
import hashlib
import random
from datetime import datetime, timedelta

PRICE_RANGES = {
    "RELIANCE": (2800, 3100), "TCS": (3500, 3900), "HDFCBANK": (1550, 1750),
    "INFY": (1400, 1650), "ICICIBANK": (1050, 1200), "HINDUNILVR": (2400, 2700),
    "ITC": (430, 480), "SBIN": (750, 850), "BAJFINANCE": (6800, 7500),
    "BHARTIARTL": (1500, 1700), "KOTAKBANK": (1750, 1950), "LT": (3200, 3600),
    "AXISBANK": (1050, 1200), "WIPRO": (450, 520), "SUNPHARMA": (1600, 1850),
    "TATAMOTORS": (750, 900), "MARUTI": (11500, 13000), "ONGC": (250, 300),
    "NTPC": (350, 400), "POWERGRID": (300, 340),
    "ASIANPAINT": (2800, 3200), "TITAN": (3200, 3600), "ULTRACEMCO": (8500, 9500),
    "NESTLEIND": (22000, 25000), "HCLTECH": (1400, 1600), "ADANIENT": (2600, 3000),
    "ADANIPORTS": (850, 1000), "TECHM": (1200, 1450), "JSWSTEEL": (800, 950),
    "TATASTEEL": (130, 165), "DRREDDY": (5500, 6200), "CIPLA": (1300, 1500),
    "DIVISLAB": (3600, 4200), "EICHERMOT": (3800, 4400), "BAJAJFINSV": (1550, 1800),
    "COALINDIA": (380, 450), "BPCL": (550, 650), "GRASIM": (2200, 2600),
    "HEROMOTOCO": (4200, 4800), "INDUSINDBK": (1350, 1550),
    "PIDILITIND": (2600, 3000), "HAVELLS": (1400, 1650), "TRENT": (4500, 5200),
    "POLYCAB": (5500, 6500), "ZOMATO": (180, 250), "PAYTM": (350, 500),
    "IRCTC": (800, 950), "TATAPOWER": (380, 450), "VEDL": (280, 350),
    "BANKBARODA": (230, 280),
}


def _seeded_rng(key: str) -> random.Random:
    h = hashlib.sha256(key.encode()).hexdigest()
    return random.Random(int(h[:16], 16))


def generate_price(symbol: str) -> float:
    lo, hi = PRICE_RANGES.get(symbol, (100, 500))
    rng = _seeded_rng(f"price:{symbol}")
    return round(rng.uniform(lo, hi), 2)


def generate_ohlcv(symbol: str, days: int = 90, interval: str = "day") -> list[dict]:
    rng = _seeded_rng(f"ohlcv:{symbol}:{interval}")
    lo, hi = PRICE_RANGES.get(symbol, (100, 500))
    base_price = rng.uniform(lo, hi)
    data = []
    current = base_price
    now = datetime.now()

    interval_minutes = {
        "minute": 1, "3minute": 3, "5minute": 5, "10minute": 10,
        "15minute": 15, "30minute": 30, "60minute": 60,
    }
    if interval in interval_minutes:
        step = interval_minutes[interval]
        market_hours = 375
        candles_per_day = market_hours // step
        for d in range(days, 0, -1):
            day_start = (now - timedelta(days=d)).replace(hour=9, minute=15, second=0, microsecond=0)
            for c in range(candles_per_day):
                t = day_start + timedelta(minutes=c * step)
                change_pct = rng.gauss(0, 0.001 * (step ** 0.5))
                open_price = round(current, 2)
                close_price = round(current * (1 + change_pct), 2)
                high = round(max(open_price, close_price) * (1 + abs(rng.gauss(0, 0.0005 * (step ** 0.5)))), 2)
                low = round(min(open_price, close_price) * (1 - abs(rng.gauss(0, 0.0005 * (step ** 0.5)))), 2)
                volume = rng.randint(1_000 * step, 50_000 * step)
                data.append({
                    "date": t.strftime("%Y-%m-%d %H:%M:%S"),
                    "open": open_price, "high": high,
                    "low": low, "close": close_price, "volume": volume,
                })
                current = close_price
        return data

    for i in range(days, 0, -1):
        date = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        change_pct = rng.gauss(0.0005, 0.015)
        open_price = round(current, 2)
        close_price = round(current * (1 + change_pct), 2)
        high = round(max(open_price, close_price) * (1 + abs(rng.gauss(0, 0.006))), 2)
        low = round(min(open_price, close_price) * (1 - abs(rng.gauss(0, 0.006))), 2)
        volume = rng.randint(500_000, 10_000_000)
        data.append({
            "date": date, "open": open_price, "high": high,
            "low": low, "close": close_price, "volume": volume,
        })
        current = close_price

    return data
