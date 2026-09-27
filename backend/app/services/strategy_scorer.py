"""Score and compare backtest results.

Produces a 0-100 composite score from key metrics and ranks multiple
strategies for side-by-side comparison.
"""
from __future__ import annotations


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _normalize(v: float | None, lo: float, hi: float) -> float:
    if v is None:
        return 0
    return _clamp((v - lo) / (hi - lo), 0, 1)


def score_strategy(metrics: dict) -> dict:
    """Return a 0-100 composite score with component breakdowns."""
    total_return = metrics.get("total_return_pct", 0) or 0
    win_rate = metrics.get("win_rate", 0) or 0
    profit_factor = metrics.get("profit_factor", 0) or 0
    sharpe = metrics.get("sharpe_ratio", 0) or 0
    sortino = metrics.get("sortino_ratio", 0) or 0
    max_dd = abs(metrics.get("max_drawdown_pct", 0) or 0)
    expectancy = metrics.get("expectancy", 0) or 0
    total_trades = metrics.get("total_trades", 0) or 0

    components = {
        "return": round(_normalize(total_return, -20, 100) * 100, 1),
        "win_rate": round(_normalize(win_rate, 20, 80) * 100, 1),
        "profit_factor": round(_normalize(profit_factor, 0.5, 3.0) * 100, 1),
        "sharpe": round(_normalize(sharpe, -0.5, 3.0) * 100, 1),
        "sortino": round(_normalize(sortino, -0.5, 4.0) * 100, 1),
        "drawdown": round((1 - _normalize(max_dd, 0, 40)) * 100, 1),
        "expectancy": round(_normalize(expectancy, -500, 2000) * 100, 1),
        "trade_count": round(_normalize(total_trades, 0, 100) * 100, 1),
    }

    weights = {
        "return": 0.20,
        "win_rate": 0.10,
        "profit_factor": 0.15,
        "sharpe": 0.20,
        "sortino": 0.10,
        "drawdown": 0.15,
        "expectancy": 0.05,
        "trade_count": 0.05,
    }

    composite = sum(components[k] * weights[k] for k in weights)

    grade = "F"
    if composite >= 85:
        grade = "A"
    elif composite >= 70:
        grade = "B"
    elif composite >= 55:
        grade = "C"
    elif composite >= 40:
        grade = "D"

    return {
        "composite": round(composite, 1),
        "grade": grade,
        "components": components,
    }


def compare_strategies(runs: list[dict]) -> list[dict]:
    """Score each run and return sorted by composite score descending."""
    scored = []
    for run in runs:
        metrics = run.get("metrics", {})
        score_result = score_strategy(metrics)
        scored.append({
            "run_id": run.get("id") or run.get("run_id"),
            "strategy_name": run.get("strategy_name", ""),
            "metrics": metrics,
            "score": score_result,
        })
    scored.sort(key=lambda x: x["score"]["composite"], reverse=True)
    for i, s in enumerate(scored):
        s["rank"] = i + 1
    return scored
