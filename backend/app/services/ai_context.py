"""Build enriched context for AI chat prompts.

Gathers scorecard, backtest, and market context data so the AI
can generate strategies informed by actual stock metrics.
"""
from __future__ import annotations


def build_stock_context(scorecard: dict) -> str:
    lines = [f"Stock: {scorecard.get('symbol', '?')} (source: {scorecard.get('source', 'mock')})"]

    for section in ("trend", "momentum", "volatility", "volume", "price_action", "returns"):
        data = scorecard.get(section, {})
        if data:
            items = ", ".join(f"{k}={v}" for k, v in data.items())
            lines.append(f"  {section}: {items}")

    return "\n".join(lines)


def build_backtest_context(metrics: dict) -> str:
    if not metrics:
        return "No backtest data available."

    lines = ["Recent backtest results:"]
    key_metrics = [
        ("total_return_pct", "Return"),
        ("win_rate", "Win Rate"),
        ("profit_factor", "Profit Factor"),
        ("sharpe_ratio", "Sharpe"),
        ("sortino_ratio", "Sortino"),
        ("max_drawdown", "Max Drawdown"),
        ("total_trades", "Total Trades"),
        ("expectancy", "Expectancy"),
    ]
    for key, label in key_metrics:
        val = metrics.get(key)
        if val is not None:
            lines.append(f"  {label}: {val}")

    return "\n".join(lines)


def build_strategy_prompt(
    symbol: str | None = None,
    scorecard: dict | None = None,
    backtest_metrics: dict | None = None,
    market_ctx: dict | None = None,
    user_message: str = "",
) -> str:
    parts = [
        "You are a quantitative trading strategy assistant. "
        "Generate Python strategies that use the ZerodhaSDK with function `analyze_stocks(sdk, symbols)`. "
        "Available SDK methods: sdk.get_universe(), sdk.get_historical(symbol, interval, days), sdk.get_quote(symbol). "
        "Return a list of dicts with keys: symbol, signal ('buy'/'sell'/'hold'), reason, entry_price, stop_loss, target.",
    ]

    if scorecard:
        parts.append("\n--- Current Stock Data ---")
        parts.append(build_stock_context(scorecard))

    if backtest_metrics:
        parts.append("\n--- Backtest Performance ---")
        parts.append(build_backtest_context(backtest_metrics))

    if market_ctx:
        trend = market_ctx.get("trend", "neutral")
        momentum = market_ctx.get("momentum", "neutral")
        volatility = market_ctx.get("volatility", "normal")
        parts.append(f"\n--- Market Context ---")
        parts.append(f"  Trend: {trend}, Momentum: {momentum}, Volatility: {volatility}")

    if user_message:
        parts.append(f"\n--- User Request ---\n{user_message}")

    return "\n".join(parts)
