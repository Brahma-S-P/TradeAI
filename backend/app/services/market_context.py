"""Market, sector, and stock context scoring.

Computes trend/momentum/volatility/relative-strength scores using
the existing compute_indicators() pipeline.
"""
from __future__ import annotations

from app.services.indicators import compute_indicators
from app.services.mock_data import generate_ohlcv


def _score_label(val: float | None, thresholds: tuple[float, float]) -> str:
    if val is None:
        return "neutral"
    if val > thresholds[1]:
        return "bullish"
    if val < thresholds[0]:
        return "bearish"
    return "neutral"


def _vol_label(val: float | None) -> str:
    if val is None:
        return "normal"
    if val > 30:
        return "high"
    if val < 15:
        return "low"
    return "normal"


def _compute_context_from_candles(candles: list[dict]) -> dict:
    ind = compute_indicators(candles)
    if not ind:
        return {"trend": "neutral", "momentum": "neutral", "volatility": "normal", "scores": {}}

    sma_50 = ind.get("price_vs_sma50")
    sma_200 = ind.get("price_vs_sma200")
    rsi = ind.get("rsi_14")
    vol = ind.get("historical_volatility_20d")
    ret_20 = ind.get("return_20d")
    ret_5 = ind.get("return_5d")

    trend_score = 0
    if sma_50 is not None:
        trend_score += 1 if sma_50 > 0 else -1
    if sma_200 is not None:
        trend_score += 1 if sma_200 > 0 else -1
    if ind.get("sma20_vs_sma50") is not None:
        trend_score += 1 if ind["sma20_vs_sma50"] > 0 else -1

    momentum_score = 0
    if rsi is not None:
        if rsi > 60:
            momentum_score += 1
        elif rsi < 40:
            momentum_score -= 1
    if ret_5 is not None:
        momentum_score += 1 if ret_5 > 0 else -1
    if ret_20 is not None:
        momentum_score += 1 if ret_20 > 0 else -1

    return {
        "trend": "bullish" if trend_score > 0 else "bearish" if trend_score < 0 else "neutral",
        "trend_score": trend_score,
        "momentum": "bullish" if momentum_score > 0 else "bearish" if momentum_score < 0 else "neutral",
        "momentum_score": momentum_score,
        "volatility": _vol_label(vol),
        "scores": {
            "price_vs_sma50": round(sma_50, 2) if sma_50 is not None else None,
            "price_vs_sma200": round(sma_200, 2) if sma_200 is not None else None,
            "rsi_14": round(rsi, 1) if rsi is not None else None,
            "return_5d": round(ret_5, 2) if ret_5 is not None else None,
            "return_20d": round(ret_20, 2) if ret_20 is not None else None,
            "volatility_20d": round(vol, 1) if vol is not None else None,
        },
    }


async def market_context(db) -> dict:
    """Compute context for the broad market (NIFTY 50 proxy)."""
    from app.services import snapshot_service
    candles = await snapshot_service.get_stored_candles(db, "NIFTY 50")
    if not candles:
        candles = generate_ohlcv("NIFTY50", days=280, interval="day")
    ctx = _compute_context_from_candles(candles)
    ctx["label"] = "Market (NIFTY)"
    return ctx


async def stock_context(db, symbol: str) -> dict:
    """Compute context for a single stock."""
    from app.services import snapshot_service
    candles = await snapshot_service.get_stored_candles(db, symbol)
    if not candles:
        candles = generate_ohlcv(symbol, days=280, interval="day")
    ctx = _compute_context_from_candles(candles)
    ctx["label"] = symbol

    # Relative strength vs market
    market_candles = await snapshot_service.get_stored_candles(db, "NIFTY 50")
    if not market_candles:
        market_candles = generate_ohlcv("NIFTY50", days=280, interval="day")
    market_ind = compute_indicators(market_candles)
    stock_ret = ctx["scores"].get("return_20d")
    market_ret = market_ind.get("return_20d")
    if stock_ret is not None and market_ret is not None:
        rs = stock_ret - market_ret
        ctx["relative_strength"] = round(rs, 2)
        ctx["rs_label"] = "outperforming" if rs > 2 else "underperforming" if rs < -2 else "inline"
    else:
        ctx["relative_strength"] = None
        ctx["rs_label"] = "unknown"

    return ctx
