"""Grid-search parameter optimizer and robustness scoring.

Optimizes strategy parameters by grid search (max 100 combinations)
and evaluates whether the best parameters are in a robust neighborhood.
"""
from __future__ import annotations

import itertools

from app.services.backtest_engine import run_backtest


def optimize_parameters(
    code: str,
    symbols: list[str],
    candles_by_symbol: dict[str, list[dict]],
    param_ranges: dict[str, list],
    initial_capital: float = 100000,
    stop_loss_pct: float = 5.0,
    target_pct: float = 10.0,
    max_positions: int = 10,
    optimize_metric: str = "sharpe_ratio",
) -> dict:
    keys = list(param_ranges.keys())
    values = list(param_ranges.values())
    combos = list(itertools.product(*values))

    if len(combos) > 100:
        step = len(combos) // 100
        combos = combos[::step][:100]

    results = []
    for combo in combos:
        params = dict(zip(keys, combo))
        param_code = _inject_params(code, params)

        try:
            result = run_backtest(
                param_code, symbols, candles_by_symbol,
                initial_capital, stop_loss_pct, target_pct, max_positions,
            )
            metric_val = result.metrics.get(optimize_metric, 0) or 0
        except (ValueError, Exception):
            metric_val = 0

        results.append({
            "params": params,
            "metric_value": round(metric_val, 4),
            "return_pct": round(result.metrics.get("total_return_pct", 0), 2) if metric_val else 0,
            "sharpe": round(result.metrics.get("sharpe_ratio", 0), 2) if metric_val else 0,
            "trades": result.metrics.get("total_trades", 0) if metric_val else 0,
        })

    results.sort(key=lambda x: x["metric_value"], reverse=True)
    best = results[0] if results else None

    robustness = robustness_score(results, keys) if len(results) > 1 else None

    return {
        "best_params": best["params"] if best else {},
        "best_metric": best["metric_value"] if best else 0,
        "results": results[:50],
        "total_combinations": len(combos),
        "optimize_metric": optimize_metric,
        "robustness": robustness,
    }


def _inject_params(code: str, params: dict) -> str:
    lines = code.split("\n")
    param_lines = [f"{k} = {repr(v)}" for k, v in params.items()]
    return "\n".join(param_lines + lines)


def robustness_score(results: list[dict], param_keys: list[str]) -> dict:
    if not results or len(results) < 3:
        return {"score": 0, "is_robust": False, "message": "Not enough data"}

    best_val = results[0]["metric_value"]
    if best_val == 0:
        return {"score": 0, "is_robust": False, "message": "Best metric is zero"}

    top_n = max(3, len(results) // 5)
    top_results = results[:top_n]
    top_values = [r["metric_value"] for r in top_results]

    avg_top = sum(top_values) / len(top_values)
    spread = (best_val - avg_top) / abs(best_val) * 100 if best_val != 0 else 100

    neighborhood_consistency = max(0, 100 - spread * 2)

    all_positive = all(v > 0 for v in top_values)
    sign_bonus = 20 if all_positive else 0

    score = min(100, neighborhood_consistency + sign_bonus)

    is_robust = score >= 60

    if score >= 80:
        message = "Parameters are in a robust plateau — low sensitivity to changes"
    elif score >= 60:
        message = "Parameters are moderately robust — some sensitivity to changes"
    elif score >= 40:
        message = "Parameters show moderate sensitivity — consider wider ranges"
    else:
        message = "Parameters are fragile — results change significantly with small tweaks"

    return {
        "score": round(score, 1),
        "is_robust": is_robust,
        "best_vs_avg_spread": round(spread, 1),
        "top_n_evaluated": top_n,
        "message": message,
    }
