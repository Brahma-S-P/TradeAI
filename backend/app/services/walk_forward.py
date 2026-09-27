"""Walk-forward testing and overfitting detection.

Splits historical data into N in-sample/out-of-sample windows and runs
the strategy on each to measure stability and detect overfitting.
"""
from __future__ import annotations

from app.services.backtest_engine import run_backtest


def _split_candles(
    candles: list[dict], n_windows: int, is_ratio: float = 0.7
) -> list[tuple[list[dict], list[dict]]]:
    total = len(candles)
    window_size = total // n_windows
    if window_size < 60:
        window_size = 60
        n_windows = total // window_size

    splits = []
    for i in range(n_windows):
        start = i * window_size
        end = min(start + window_size, total)
        segment = candles[start:end]
        split_idx = int(len(segment) * is_ratio)
        if split_idx < 30 or (len(segment) - split_idx) < 15:
            continue
        splits.append((segment[:split_idx], segment[split_idx:]))
    return splits


def run_walk_forward(
    code: str,
    symbols: list[str],
    candles_by_symbol: dict[str, list[dict]],
    n_windows: int = 4,
    is_ratio: float = 0.7,
    initial_capital: float = 100000,
    stop_loss_pct: float = 5.0,
    target_pct: float = 10.0,
    max_positions: int = 10,
) -> dict:
    windows = []

    first_sym = symbols[0] if symbols else None
    ref_candles = candles_by_symbol.get(first_sym, []) if first_sym else []
    if not ref_candles:
        return {"windows": [], "stability_score": 0, "overfitting": None}

    splits = _split_candles(ref_candles, n_windows, is_ratio)

    for idx, (is_candles, oos_candles) in enumerate(splits):
        is_start = is_candles[0].get("date", "") if is_candles else ""
        is_end = is_candles[-1].get("date", "") if is_candles else ""
        oos_start = oos_candles[0].get("date", "") if oos_candles else ""
        oos_end = oos_candles[-1].get("date", "") if oos_candles else ""

        is_by_sym = {}
        oos_by_sym = {}
        for sym in symbols:
            all_c = candles_by_symbol.get(sym, [])
            is_len = len(is_candles)
            oos_len = len(oos_candles)
            offset = idx * (is_len + oos_len)
            is_by_sym[sym] = all_c[offset:offset + is_len] if len(all_c) > offset else is_candles
            oos_by_sym[sym] = all_c[offset + is_len:offset + is_len + oos_len] if len(all_c) > offset + is_len else oos_candles

        try:
            is_result = run_backtest(code, symbols, is_by_sym, initial_capital, stop_loss_pct, target_pct, max_positions)
            is_metrics = is_result.metrics
        except (ValueError, Exception):
            is_metrics = {"total_return_pct": 0, "sharpe_ratio": 0, "win_rate": 0}

        try:
            oos_result = run_backtest(code, symbols, oos_by_sym, initial_capital, stop_loss_pct, target_pct, max_positions)
            oos_metrics = oos_result.metrics
        except (ValueError, Exception):
            oos_metrics = {"total_return_pct": 0, "sharpe_ratio": 0, "win_rate": 0}

        windows.append({
            "window": idx + 1,
            "is_period": f"{is_start} → {is_end}",
            "oos_period": f"{oos_start} → {oos_end}",
            "is_return": round(is_metrics.get("total_return_pct", 0), 2),
            "oos_return": round(oos_metrics.get("total_return_pct", 0), 2),
            "is_sharpe": round(is_metrics.get("sharpe_ratio", 0), 2),
            "oos_sharpe": round(oos_metrics.get("sharpe_ratio", 0), 2),
            "is_win_rate": round(is_metrics.get("win_rate", 0), 1),
            "oos_win_rate": round(oos_metrics.get("win_rate", 0), 1),
        })

    overfitting = detect_overfitting(windows)
    stability = _stability_score(windows)

    return {
        "windows": windows,
        "stability_score": stability,
        "overfitting": overfitting,
    }


def detect_overfitting(windows: list[dict]) -> dict:
    if not windows:
        return {"is_overfit": False, "degradation_pct": 0, "message": "No data"}

    is_returns = [w["is_return"] for w in windows]
    oos_returns = [w["oos_return"] for w in windows]
    avg_is = sum(is_returns) / len(is_returns) if is_returns else 0
    avg_oos = sum(oos_returns) / len(oos_returns) if oos_returns else 0

    degradation = avg_is - avg_oos if avg_is != 0 else 0
    degradation_pct = (degradation / abs(avg_is) * 100) if avg_is != 0 else 0

    is_overfit = degradation_pct > 50

    if is_overfit:
        message = f"Warning: {degradation_pct:.0f}% degradation from IS to OOS — likely overfit"
    elif degradation_pct > 25:
        message = f"Moderate degradation ({degradation_pct:.0f}%) — review parameter sensitivity"
    else:
        message = f"Low degradation ({degradation_pct:.0f}%) — strategy appears robust"

    return {
        "is_overfit": is_overfit,
        "degradation_pct": round(degradation_pct, 1),
        "avg_is_return": round(avg_is, 2),
        "avg_oos_return": round(avg_oos, 2),
        "message": message,
    }


def _stability_score(windows: list[dict]) -> float:
    if len(windows) < 2:
        return 0
    oos_returns = [w["oos_return"] for w in windows]
    positive_windows = sum(1 for r in oos_returns if r > 0)
    consistency = positive_windows / len(oos_returns)

    avg_ret = sum(oos_returns) / len(oos_returns)
    variance = sum((r - avg_ret) ** 2 for r in oos_returns) / len(oos_returns)
    std = variance ** 0.5
    cv = abs(std / avg_ret) if avg_ret != 0 else 10
    smoothness = max(0, 1 - cv / 3)

    return round(consistency * 50 + smoothness * 50, 1)
