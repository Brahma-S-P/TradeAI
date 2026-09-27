"""Generate current trading signals from a strategy and candle data.

Provides a high-level signal (BUY/SELL/WAIT) with confidence and reasoning,
plus entry/target/stop levels.
"""
from __future__ import annotations

from app.services.indicators import compute_indicators
from app.services.strategy_scorer import score_strategy


def generate_current_signal(
    symbol: str,
    code: str,
    candles: list[dict],
) -> dict:
    if not candles:
        return _wait_signal(symbol, "No candle data")

    ind = compute_indicators(candles)
    if not ind:
        return _wait_signal(symbol, "Could not compute indicators")

    from app.services.strategy_runner import run_analyzer_strategy
    try:
        results = run_analyzer_strategy(code, [symbol], {symbol: candles})
    except (ValueError, Exception):
        return _wait_signal(symbol, "Strategy execution failed")

    if not results:
        return _wait_signal(symbol, "Strategy returned no signals")

    result = results[0] if isinstance(results, list) else results
    signal = result.get("signal", "hold").upper()
    if signal not in ("BUY", "SELL"):
        signal = "WAIT"

    price = candles[-1]["close"]
    rsi = ind.get("rsi_14", 50)
    atr = ind.get("atr_14", price * 0.02)

    reasons = []
    if result.get("reason"):
        reasons.append(result["reason"])

    if rsi and rsi < 30:
        reasons.append("RSI oversold")
    elif rsi and rsi > 70:
        reasons.append("RSI overbought")

    trend = ind.get("price_vs_sma50", 0)
    if trend and trend > 3:
        reasons.append("Above SMA50")
    elif trend and trend < -3:
        reasons.append("Below SMA50")

    confidence = _compute_confidence(signal, ind, result)

    entry = result.get("entry_price", price)
    stop = result.get("stop_loss", price - (atr or price * 0.02) * 2)
    target = result.get("target", price + (atr or price * 0.02) * 3)

    return {
        "symbol": symbol,
        "signal": signal,
        "confidence": confidence,
        "reasons": reasons[:5],
        "entry_price": round(entry, 2),
        "stop_loss": round(stop, 2),
        "target": round(target, 2),
        "risk_reward": round((target - entry) / (entry - stop), 2) if entry > stop else 0,
        "current_price": round(price, 2),
        "indicators": {
            "rsi_14": round(rsi, 1) if rsi else None,
            "atr_14": round(atr, 2) if atr else None,
            "price_vs_sma50": round(trend, 2) if trend else None,
        },
    }


def _wait_signal(symbol: str, reason: str) -> dict:
    return {
        "symbol": symbol,
        "signal": "WAIT",
        "confidence": 0,
        "reasons": [reason],
        "entry_price": 0,
        "stop_loss": 0,
        "target": 0,
        "risk_reward": 0,
        "current_price": 0,
        "indicators": {},
    }


def _compute_confidence(signal: str, ind: dict, result: dict) -> int:
    if signal == "WAIT":
        return 0

    score = 50
    rsi = ind.get("rsi_14", 50)

    if signal == "BUY":
        if rsi and rsi < 35:
            score += 15
        if ind.get("price_vs_sma50", 0) and ind["price_vs_sma50"] > 0:
            score += 10
        if ind.get("rvol", 1) and ind["rvol"] > 1.5:
            score += 10
        if ind.get("macd_above_zero"):
            score += 5
    elif signal == "SELL":
        if rsi and rsi > 65:
            score += 15
        if ind.get("price_vs_sma50", 0) and ind["price_vs_sma50"] < 0:
            score += 10
        if ind.get("rvol", 1) and ind["rvol"] > 1.5:
            score += 10

    return min(95, max(10, score))


def select_best_strategy(symbol: str, runs: list[dict]) -> dict | None:
    if not runs:
        return None

    scored = []
    for run in runs:
        metrics = run.get("metrics", {})
        s = score_strategy(metrics)
        scored.append({"run": run, "score": s})

    scored.sort(key=lambda x: x["score"]["composite"], reverse=True)
    best = scored[0]
    return {
        "run_id": best["run"].get("id"),
        "score": best["score"],
        "strategy_code": best["run"].get("strategy_code", ""),
    }
