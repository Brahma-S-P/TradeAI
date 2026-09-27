"""Evaluate a visual strategy's JSON condition tree against OHLCV data.

Condition tree format:
{
  "entry": [{"indicator": "rsi_14", "operator": "<", "value": 30}, ...],
  "exit": [{"indicator": "rsi_14", "operator": ">", "value": 70}, ...],
  "risk": {"stop_loss_pct": 3, "target_pct": 6, "trailing_stop": false}
}

All entry conditions must be true for a BUY signal.
Any exit condition being true triggers a SELL signal.
"""
from __future__ import annotations

from app.services.indicators import compute_indicators


_OPS = {
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    "=": lambda a, b: abs(a - b) < 0.01,
    "!=": lambda a, b: abs(a - b) >= 0.01,
    "crosses_above": lambda a, b: a > b,  # simplified: current > threshold
    "crosses_below": lambda a, b: a < b,
}


def _eval_condition(cond: dict, indicators: dict) -> bool:
    ind_key = cond.get("indicator", "")
    op_key = cond.get("operator", ">")
    threshold = cond.get("value")

    actual = indicators.get(ind_key)
    if actual is None or threshold is None:
        return False
    if isinstance(actual, bool):
        return actual == bool(threshold)

    try:
        threshold = float(threshold)
    except (ValueError, TypeError):
        return False

    op_fn = _OPS.get(op_key)
    if not op_fn:
        return False
    return op_fn(float(actual), threshold)


def run_visual_strategy(
    conditions: dict,
    symbols: list[str],
    candles_by_symbol: dict[str, list[dict]],
    trading_params: dict | None = None,
) -> list[dict]:
    """Evaluate a visual condition tree against the latest data for each symbol."""
    trading_params = trading_params or {}
    entry_conds = conditions.get("entry", [])
    exit_conds = conditions.get("exit", [])
    risk = conditions.get("risk", {})

    results = []
    for sym in symbols:
        candles = candles_by_symbol.get(sym, [])
        if not candles:
            continue

        ind = compute_indicators(candles)
        if not ind:
            continue

        entry_pass = all(_eval_condition(c, ind) for c in entry_conds) if entry_conds else False
        exit_pass = any(_eval_condition(c, ind) for c in exit_conds) if exit_conds else False

        if entry_pass and not exit_pass:
            signal = "buy"
            reason = " & ".join(
                f"{c.get('indicator')} {c.get('operator')} {c.get('value')}"
                for c in entry_conds
            )
        elif exit_pass:
            signal = "sell"
            reason = " | ".join(
                f"{c.get('indicator')} {c.get('operator')} {c.get('value')}"
                for c in exit_conds
            )
        else:
            signal = "hold"
            reason = "No conditions met"

        price = candles[-1]["close"]
        stop = price * (1 - risk.get("stop_loss_pct", 3) / 100)
        target = price * (1 + risk.get("target_pct", 6) / 100)

        capital = trading_params.get("initial_capital", 100000)
        pct = trading_params.get("position_size_pct", 10)
        qty = max(1, int((capital * pct / 100) / price)) if price > 0 else 0

        results.append({
            "symbol": sym,
            "signal": signal,
            "reason": reason,
            "entry_price": round(price, 2),
            "stop_loss": round(stop, 2),
            "target": round(target, 2),
            "quantity": qty,
            "position_value": round(qty * price, 2),
        })

    return results


def scan_visual_trade_markers(
    conditions: dict,
    symbol: str,
    candles: list[dict],
) -> list[dict]:
    """Bar-by-bar scan through candles to find entry/exit transitions.

    Returns a list of {date, signal, price, label} suitable for chart markers.
    """
    entry_conds = conditions.get("entry", [])
    exit_conds = conditions.get("exit", [])
    if not entry_conds and not exit_conds:
        return []
    if len(candles) < 20:
        return []

    markers: list[dict] = []
    in_position = False

    for i in range(20, len(candles)):
        subset = candles[: i + 1]
        ind = compute_indicators(subset)
        if not ind:
            continue

        entry_pass = all(_eval_condition(c, ind) for c in entry_conds) if entry_conds else False
        exit_pass = any(_eval_condition(c, ind) for c in exit_conds) if exit_conds else False

        bar = candles[i]
        date = bar.get("date", "")

        if not in_position and entry_pass and not exit_pass:
            in_position = True
            markers.append({
                "date": date,
                "signal": "BUY",
                "price": bar["close"],
                "label": "BUY",
            })
        elif in_position and exit_pass:
            in_position = False
            markers.append({
                "date": date,
                "signal": "SELL",
                "price": bar["close"],
                "label": "SELL",
            })

    return markers
