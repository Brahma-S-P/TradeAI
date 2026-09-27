"""Pre-built visual strategy templates.

Each template is a dict with metadata + the condition tree that
VisualStrategyBuilder can load directly.
"""
from __future__ import annotations

TEMPLATES: list[dict] = [
    {
        "id": "rsi_oversold_bounce",
        "name": "RSI Oversold Bounce",
        "category": "Mean Reversion",
        "description": "Buy when RSI drops below 30 (oversold), sell when it recovers above 70.",
        "conditions": {
            "entry": [
                {"indicator": "rsi_14", "operator": "<", "value": 30},
            ],
            "exit": [
                {"indicator": "rsi_14", "operator": ">", "value": 70},
            ],
            "risk": {"stop_loss_pct": 3, "target_pct": 6, "trailing_stop": False},
        },
    },
    {
        "id": "ma_crossover",
        "name": "Moving Average Crossover",
        "category": "Trend Following",
        "description": "Buy when price is above SMA 50 and SMA 20 > SMA 50. Sell when price drops below SMA 50.",
        "conditions": {
            "entry": [
                {"indicator": "price_vs_sma50", "operator": ">", "value": 0},
                {"indicator": "sma20_vs_sma50", "operator": ">", "value": 0},
            ],
            "exit": [
                {"indicator": "price_vs_sma50", "operator": "<", "value": -2},
            ],
            "risk": {"stop_loss_pct": 4, "target_pct": 8, "trailing_stop": False},
        },
    },
    {
        "id": "volume_breakout",
        "name": "Volume Breakout",
        "category": "Breakout",
        "description": "Buy on 20-day breakout with volume surge (RVOL > 2). Exit when momentum fades.",
        "conditions": {
            "entry": [
                {"indicator": "breakout_20d", "operator": "=", "value": 1},
                {"indicator": "rvol", "operator": ">", "value": 2},
            ],
            "exit": [
                {"indicator": "rsi_14", "operator": ">", "value": 75},
            ],
            "risk": {"stop_loss_pct": 3, "target_pct": 10, "trailing_stop": False},
        },
    },
    {
        "id": "bollinger_squeeze",
        "name": "Bollinger Squeeze",
        "category": "Volatility",
        "description": "Buy when volatility is low (ATR% < 2) and price is near SMA 20. Sell on RSI overbought.",
        "conditions": {
            "entry": [
                {"indicator": "atr_percentage", "operator": "<", "value": 2},
                {"indicator": "rsi_14", "operator": "<", "value": 50},
            ],
            "exit": [
                {"indicator": "rsi_14", "operator": ">", "value": 70},
            ],
            "risk": {"stop_loss_pct": 2, "target_pct": 5, "trailing_stop": False},
        },
    },
    {
        "id": "macd_cross",
        "name": "MACD Cross",
        "category": "Momentum",
        "description": "Buy when MACD crosses above zero with RSI confirmation. Sell when MACD goes negative.",
        "conditions": {
            "entry": [
                {"indicator": "macd", "operator": ">", "value": 0},
                {"indicator": "rsi_14", "operator": ">", "value": 40},
            ],
            "exit": [
                {"indicator": "macd", "operator": "<", "value": 0},
            ],
            "risk": {"stop_loss_pct": 4, "target_pct": 8, "trailing_stop": False},
        },
    },
    {
        "id": "trend_pullback",
        "name": "Trend Pullback",
        "category": "Trend Following",
        "description": "Buy in an uptrend (above SMA 200) when RSI pulls back below 40. Exit on momentum loss.",
        "conditions": {
            "entry": [
                {"indicator": "price_vs_sma200", "operator": ">", "value": 0},
                {"indicator": "rsi_14", "operator": "<", "value": 40},
            ],
            "exit": [
                {"indicator": "price_vs_sma200", "operator": "<", "value": -3},
            ],
            "risk": {"stop_loss_pct": 5, "target_pct": 10, "trailing_stop": False},
        },
    },
]


def get_templates() -> list[dict]:
    return TEMPLATES


def get_template(template_id: str) -> dict | None:
    for t in TEMPLATES:
        if t["id"] == template_id:
            return t
    return None
