"""Executes stock-picking strategies: manual indicator filters and AI-generated code.

Filters read pre-computed indicator values from the snapshot DB. When no snapshot
data exists for a symbol, it falls back to deterministic mock values. Code
strategies run in-process against a ZerodhaSDK that reads stored candles.
"""

import hashlib
import random
from datetime import datetime

from app.services.mock_data import generate_ohlcv, generate_price
from app.services.event_log import log_event


def _seeded_random(key: str) -> random.Random:
    h = hashlib.sha256(key.encode()).hexdigest()
    return random.Random(int(h[:16], 16))


def _mock_numeric_value(symbol: str, indicator_id: str) -> float:
    rnd = _seeded_random(f"{symbol}:{indicator_id}")
    if any(k in indicator_id for k in ("return", "pct", "change", "momentum")):
        return round(rnd.uniform(-15, 15), 2)
    if "rsi" in indicator_id:
        return round(rnd.uniform(10, 90), 1)
    if any(k in indicator_id for k in ("ratio", "rvol")):
        return round(rnd.uniform(0.3, 4.0), 2)
    return round(rnd.uniform(0, 100), 2)


def _mock_bool_value(symbol: str, indicator_id: str) -> bool:
    rnd = _seeded_random(f"{symbol}:{indicator_id}:bool")
    return rnd.random() > 0.5


def _passes_filter(symbol: str, f: dict, values: dict | None = None) -> bool:
    op = f.get("operator", ">")
    ind_id = f.get("id", "")
    values = values or {}
    real = values.get(ind_id)  # real snapshot value if available

    if op in ("= true", "= false"):
        actual_bool = real if isinstance(real, bool) else _mock_bool_value(symbol, ind_id)
        return actual_bool == (op == "= true")

    value_raw = str(f.get("value", "")).strip()
    if value_raw == "":
        return True

    try:
        threshold = float(value_raw)
    except ValueError:
        rnd = _seeded_random(f"{symbol}:{ind_id}:{value_raw}")
        return rnd.random() > 0.6

    actual = real if isinstance(real, (int, float)) and not isinstance(real, bool) else _mock_numeric_value(symbol, ind_id)
    if op == ">":
        return actual > threshold
    if op == ">=":
        return actual >= threshold
    if op == "<":
        return actual < threshold
    if op == "<=":
        return actual <= threshold
    if op == "=":
        return abs(actual - threshold) < 0.01
    if op == "between":
        try:
            threshold2 = float(f.get("value2", threshold))
        except ValueError:
            threshold2 = threshold
        lo, hi = sorted([threshold, threshold2])
        return lo <= actual <= hi
    return True


def run_manual_strategy(
    candidates: list[dict], filters: list[dict],
    values_by_symbol: dict | None = None, stats: dict | None = None,
) -> list[dict]:
    """Filter candidates by ALL filters. If `stats` is provided, it's populated
    with processed/matched counts, per-filter pass counts, and live-data count."""
    values_by_symbol = values_by_symbol or {}
    per_filter = {f.get("id", "?"): 0 for f in filters}
    live = 0
    results = []
    for s in candidates:
        symbol = s["symbol"]
        vals = values_by_symbol.get(symbol)
        if vals:
            live += 1
        # evaluate every filter (no short-circuit) so we can count per-filter passes
        passed_all = True
        for f in filters:
            if _passes_filter(symbol, f, vals):
                per_filter[f.get("id", "?")] += 1
            else:
                passed_all = False
        if passed_all:
            price = None
            if vals:
                price = vals.get("filter_price") or vals.get("close")
            if not price:
                price = generate_price(symbol)
            results.append({
                "symbol": symbol,
                "name": s["name"],
                "sector": s["sector"],
                "price": price,
                "matched_criteria": ", ".join(f.get("id", "") for f in filters) or "No filters set",
                "timestamp": datetime.now().isoformat(),
            })
    if stats is not None:
        stats["processed"] = len(candidates)
        stats["matched"] = len(results)
        stats["per_filter"] = per_filter
        stats["live_data"] = live
    return results


class ZerodhaSDK:
    def __init__(self, symbols: list[str], candles_by_symbol: dict | None = None, trading_params: dict | None = None):
        self._symbols = symbols
        self._candles = candles_by_symbol or {}
        self.params = trading_params or {}
        self.initial_capital = self.params.get("initial_capital", 100000)
        self.max_trades_per_day = self.params.get("max_trades_per_day", 5)
        self.position_size_pct = self.params.get("position_size_pct", 10)
        self.interval = self.params.get("interval", "day")
        self.date_from = self.params.get("date_from")
        self.date_to = self.params.get("date_to")

    def get_universe(self, index_name: str | None = None) -> list[str]:
        return list(self._symbols)

    def get_historical(self, symbol: str, days: int = 20) -> list[dict]:
        stored = self._candles.get(symbol)
        if stored:
            log_event(f"  SDK.get_historical({symbol}, {days}) → live ({len(stored)} candles stored, returning last {min(days, len(stored))})", source="sdk", level="info")
            return stored[-days:] if days else stored
        log_event(f"  SDK.get_historical({symbol}, {days}) → mock (no stored candles)", source="sdk", level="warn")
        return generate_ohlcv(symbol, days=days, interval=self.interval)

    def get_quote(self, symbol: str) -> dict:
        price = generate_price(symbol)
        log_event(f"  SDK.get_quote({symbol}) → mock ₹{price}", source="sdk", level="warn")
        return {"symbol": symbol, "ltp": price}

    def get_position_size(self, price: float) -> int:
        allocation = self.initial_capital * (self.position_size_pct / 100)
        return max(1, int(allocation / price)) if price > 0 else 0


def run_analyzer_strategy(
    code: str, symbols: list[str], candles_by_symbol: dict | None = None,
    trading_params: dict | None = None,
) -> list[dict]:
    namespace: dict = {}
    try:
        exec(code, {"__builtins__": __builtins__}, namespace)
    except Exception as e:
        raise ValueError(f"Code compile error: {e}")

    analyze_fn = namespace.get("analyze_stocks")
    if not callable(analyze_fn):
        raise ValueError("Code must define an analyze_stocks(sdk, symbols) function")

    try:
        raw_results = analyze_fn(ZerodhaSDK(symbols, candles_by_symbol, trading_params), symbols)
    except Exception as e:
        raise ValueError(f"Code execution error: {e}")

    output = []
    for r in raw_results or []:
        sym = r.get("symbol")
        if not sym:
            continue
        output.append({
            "symbol": sym,
            "signal": r.get("signal", "hold"),
            "reason": r.get("reason", ""),
            "entry_price": r.get("entry_price", 0),
            "target": r.get("target", 0),
            "stop_loss": r.get("stop_loss", 0),
        })
    return output


def scan_code_trade_markers(
    code: str,
    symbol: str,
    candles: list[dict],
    trading_params: dict | None = None,
) -> list[dict]:
    """Run a code strategy bar-by-bar on one symbol to find entry/exit transitions."""
    if len(candles) < 20:
        return []

    namespace: dict = {}
    try:
        exec(code, {"__builtins__": __builtins__}, namespace)
    except Exception:
        return []

    analyze_fn = namespace.get("analyze_stocks")
    if not callable(analyze_fn):
        return []

    markers: list[dict] = []
    in_position = False
    step = max(1, len(candles) // 200)

    for i in range(20, len(candles), step):
        subset = candles[: i + 1]
        try:
            sdk = ZerodhaSDK([symbol], {symbol: subset}, trading_params)
            results = analyze_fn(sdk, [symbol])
        except Exception:
            continue

        if not results:
            continue

        sig = None
        for r in results:
            if r.get("symbol", "").upper() == symbol.upper():
                sig = r.get("signal", "hold").lower()
                break
        if not sig:
            continue

        bar = candles[i]
        date = bar.get("date", "")

        if not in_position and sig == "buy":
            in_position = True
            markers.append({
                "date": date,
                "signal": "BUY",
                "price": bar["close"],
                "label": "BUY",
            })
        elif in_position and sig == "sell":
            in_position = False
            markers.append({
                "date": date,
                "signal": "SELL",
                "price": bar["close"],
                "label": "SELL",
            })

    return markers


def run_code_strategy(
    code: str, candidates: list[dict], candles_by_symbol: dict | None = None
) -> list[dict]:
    symbols = [c["symbol"] for c in candidates]
    lookup = {c["symbol"]: c for c in candidates}

    namespace: dict = {}
    try:
        exec(code, {"__builtins__": __builtins__}, namespace)
    except Exception as e:
        raise ValueError(f"Code compile error: {e}")

    pick_fn = namespace.get("pick_stocks")
    if not callable(pick_fn):
        raise ValueError("Code must define a pick_stocks(sdk) function")

    try:
        raw_results = pick_fn(ZerodhaSDK(symbols, candles_by_symbol))
    except Exception as e:
        raise ValueError(f"Code execution error: {e}")

    output = []
    for r in raw_results or []:
        sym = r.get("symbol")
        if not sym:
            continue
        info = lookup.get(sym, {})
        output.append({
            "symbol": sym,
            "name": info.get("name", sym),
            "sector": info.get("sector", ""),
            "price": r.get("price") or generate_price(sym),
            "matched_criteria": r.get("criteria", "AI strategy match"),
            "timestamp": datetime.now().isoformat(),
        })
    return output


