"""Agent tool definitions and execution for the Stock Picker AI chatbot.

Each tool wraps existing service functions so the AI agent can control
the Stock Picker tab: create strategies, run them, manage batches, etc.
"""
from __future__ import annotations

import json
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategy import Strategy
from app.models.batch import Batch
from app.services import snapshot_service
from app.services.strategy_runner import run_manual_strategy, run_code_strategy
from app.services.universe import get_universe
from app.services.event_log import log_event

TOOL_DEFINITIONS = [
    {
        "name": "list_indicators",
        "description": "List all available indicator IDs that can be used in strategy filters. Returns indicator id, label, type, and description. Use this to understand what filters are available before creating a strategy.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "Optional category to filter by (e.g. 'momentum', 'trend', 'volume'). Leave empty for all."
                }
            },
            "required": [],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_stock_universe",
        "description": "Get the list of stocks in a given index (e.g. NIFTY500, NIFTY50, NIFTY_MIDCAP_100). Returns symbol, name, sector for each stock.",
        "input_schema": {
            "type": "object",
            "properties": {
                "index": {
                    "type": "string",
                    "description": "Index name like NIFTY500, NIFTY50, etc. Defaults to NIFTY500."
                }
            },
            "required": [],
            "additionalProperties": False,
        },
    },
    {
        "name": "run_manual_strategy",
        "description": "Run a filter-based stock picking strategy. Each filter specifies an indicator ID, operator, and value. Returns the list of stocks that pass ALL filters.",
        "input_schema": {
            "type": "object",
            "properties": {
                "filters": {
                    "type": "array",
                    "description": "List of filter conditions",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string", "description": "Indicator ID (e.g. rsi_14, return_5d, volume_ratio_20d)"},
                            "operator": {"type": "string", "enum": [">", ">=", "<", "<=", "=", "between", "= true", "= false"]},
                            "value": {"type": "string", "description": "Threshold value"},
                            "value2": {"type": "string", "description": "Second value for 'between' operator"}
                        },
                        "required": ["id", "operator", "value"],
                        "additionalProperties": False,
                    }
                },
                "index": {
                    "type": "string",
                    "description": "Stock universe to screen. Default NIFTY500."
                },
                "sector": {
                    "type": "string",
                    "description": "Optional sector filter (e.g. 'Information Technology', 'Financial Services')"
                }
            },
            "required": ["filters"],
            "additionalProperties": False,
        },
    },
    {
        "name": "run_code_strategy",
        "description": "Run a Python code-based stock picking strategy. The code must define a `pick_stocks(sdk)` function that uses the ZerodhaSDK. SDK methods: sdk.get_universe(index), sdk.get_historical(symbol, days), sdk.get_quote(symbol). Return a list of dicts with keys: symbol, price, criteria.",
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "Python code defining pick_stocks(sdk) function"
                },
                "index": {
                    "type": "string",
                    "description": "Stock universe. Default NIFTY500."
                }
            },
            "required": ["code"],
            "additionalProperties": False,
        },
    },
    {
        "name": "save_strategy",
        "description": "Save a strategy (manual or code) to the database for later reuse.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Strategy name"},
                "strategy_type": {"type": "string", "enum": ["manual", "code"], "description": "Type of strategy"},
                "code": {"type": "string", "description": "Python code (for code strategies)"},
                "filters": {
                    "type": "array",
                    "description": "Filter conditions (for manual strategies)",
                    "items": {"type": "object"}
                },
                "description": {"type": "string", "description": "Strategy description"},
                "index_filter": {"type": "string", "description": "Default index for this strategy"}
            },
            "required": ["name", "strategy_type"],
            "additionalProperties": False,
        },
    },
    {
        "name": "list_saved_strategies",
        "description": "List all saved strategies. Returns id, name, type, description, and filter/code summary.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        },
    },
    {
        "name": "load_strategy",
        "description": "Load a specific saved strategy by ID. Returns full details including code and filters.",
        "input_schema": {
            "type": "object",
            "properties": {
                "strategy_id": {"type": "integer", "description": "Strategy ID to load"}
            },
            "required": ["strategy_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "create_batch",
        "description": "Create a batch (watchlist) of stocks. Batches are named collections of symbols that can be used as a custom universe.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Batch name"},
                "symbols": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of stock symbols (e.g. ['RELIANCE', 'TCS', 'INFY'])"
                }
            },
            "required": ["name", "symbols"],
            "additionalProperties": False,
        },
    },
    {
        "name": "list_batches",
        "description": "List all saved batches/watchlists with their symbols.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_snapshot_data",
        "description": "Get pre-computed indicator values for specific stocks from today's snapshot. Returns all indicator values like RSI, moving averages, returns, volume ratios, etc.",
        "input_schema": {
            "type": "object",
            "properties": {
                "symbols": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of stock symbols to get data for"
                }
            },
            "required": ["symbols"],
            "additionalProperties": False,
        },
    },
    {
        "name": "run_backtest",
        "description": "Run a backtest on a code strategy against historical data. The code must define analyze_stocks(sdk, symbols). Returns performance metrics: return, win rate, Sharpe, drawdown, trade log.",
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {"type": "string", "description": "Strategy code with analyze_stocks(sdk, symbols) function"},
                "symbols": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Symbols to backtest on"
                },
                "initial_capital": {"type": "number", "description": "Starting capital. Default 100000."},
                "stop_loss_pct": {"type": "number", "description": "Stop loss percentage. Default 5."},
                "target_pct": {"type": "number", "description": "Target percentage. Default 10."}
            },
            "required": ["code", "symbols"],
            "additionalProperties": False,
        },
    },
]


def _load_indicator_catalog() -> list[dict]:
    import os
    catalog_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "..",
        "frontend", "src", "config", "indicator-catalog.json"
    )
    catalog_path = os.path.normpath(catalog_path)
    try:
        with open(catalog_path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


async def execute_tool(
    name: str, inputs: dict, db: AsyncSession
) -> str:
    """Execute a tool and return a JSON string result."""
    if not isinstance(inputs, dict):
        inputs = {}
    log_event(f"Agent tool: {name}({json.dumps(inputs, default=str)[:200]})", source="agent", level="info")

    try:
        if name == "list_indicators":
            return await _tool_list_indicators(inputs)
        elif name == "get_stock_universe":
            return await _tool_get_universe(inputs, db)
        elif name == "run_manual_strategy":
            return await _tool_run_manual(inputs, db)
        elif name == "run_code_strategy":
            return await _tool_run_code(inputs, db)
        elif name == "save_strategy":
            return await _tool_save_strategy(inputs, db)
        elif name == "list_saved_strategies":
            return await _tool_list_strategies(db)
        elif name == "load_strategy":
            return await _tool_load_strategy(inputs, db)
        elif name == "create_batch":
            return await _tool_create_batch(inputs, db)
        elif name == "list_batches":
            return await _tool_list_batches(db)
        elif name == "get_snapshot_data":
            return await _tool_get_snapshot(inputs, db)
        elif name == "run_backtest":
            return await _tool_run_backtest(inputs, db)
        else:
            return json.dumps({"error": f"Unknown tool: {name}"})
    except Exception as e:
        log_event(f"Agent tool error: {name} — {e}", source="agent", level="error")
        return json.dumps({"error": str(e)})


async def _tool_list_indicators(inputs: dict) -> str:
    catalog = _load_indicator_catalog()
    category = inputs.get("category", "").lower()
    results = []
    for cat in catalog:
        cat_name = cat.get("category", "")
        if category and category not in cat_name.lower():
            continue
        for ind in cat.get("indicators", []):
            results.append({
                "id": ind["id"],
                "label": ind["label"],
                "type": ind.get("type", "number"),
                "description": ind.get("description", ""),
                "category": cat_name,
            })
    if len(results) > 50:
        summary = f"Found {len(results)} indicators. Showing first 50. Use a category filter for specific ones."
        results = results[:50]
        return json.dumps({"summary": summary, "indicators": results})
    return json.dumps({"count": len(results), "indicators": results})


async def _tool_get_universe(inputs: dict, db: AsyncSession) -> str:
    index = inputs.get("index", "NIFTY500")
    stocks = await get_universe(db, index=index)
    summary = [{"symbol": s["symbol"], "name": s["name"], "sector": s.get("sector", "")} for s in stocks[:20]]
    return json.dumps({
        "index": index,
        "total_stocks": len(stocks),
        "sample": summary,
        "note": f"Showing first 20 of {len(stocks)} stocks" if len(stocks) > 20 else None,
    })


async def _tool_run_manual(inputs: dict, db: AsyncSession) -> str:
    filters = inputs.get("filters", [])
    index = inputs.get("index", "NIFTY500")
    sector = inputs.get("sector")

    candidates = await get_universe(db, index=index)
    if sector:
        candidates = [s for s in candidates if s.get("sector") == sector]

    symbols = {s["symbol"] for s in candidates}
    values = await snapshot_service.get_snapshot_values(db, symbols)

    stats: dict = {}
    results = run_manual_strategy(candidates, filters, values_by_symbol=values, stats=stats)

    log_event(
        f"Agent ran manual strategy: {len(filters)} filters → {len(results)} matches from {stats.get('processed', 0)} stocks",
        source="agent", level="success"
    )

    return json.dumps({
        "matched": len(results),
        "total_screened": stats.get("processed", 0),
        "live_data_count": stats.get("live_data", 0),
        "results": results[:30],
        "filters_used": filters,
        "note": f"Showing top 30 of {len(results)} matches" if len(results) > 30 else None,
    })


async def _tool_run_code(inputs: dict, db: AsyncSession) -> str:
    code = inputs["code"]
    index = inputs.get("index", "NIFTY500")

    candidates = await get_universe(db, index=index)
    candles: dict[str, list] = {}
    for c in candidates:
        stored = await snapshot_service.get_stored_candles(db, c["symbol"])
        if stored:
            candles[c["symbol"]] = stored

    results = run_code_strategy(code, candidates, candles_by_symbol=candles)

    log_event(
        f"Agent ran code strategy → {len(results)} picks",
        source="agent", level="success"
    )

    return json.dumps({
        "matched": len(results),
        "results": results[:30],
        "note": f"Showing top 30 of {len(results)} matches" if len(results) > 30 else None,
    })


async def _tool_save_strategy(inputs: dict, db: AsyncSession) -> str:
    strategy = Strategy(
        name=inputs["name"],
        strategy_type=inputs["strategy_type"],
        code=inputs.get("code", ""),
        filters=json.dumps(inputs.get("filters", [])),
        index_filter=inputs.get("index_filter", ""),
        description=inputs.get("description", ""),
    )
    db.add(strategy)
    await db.commit()
    await db.refresh(strategy)

    log_event(f"Agent saved strategy: {strategy.name} (id={strategy.id})", source="agent", level="success")
    return json.dumps({"id": strategy.id, "name": strategy.name, "status": "saved"})


async def _tool_list_strategies(db: AsyncSession) -> str:
    q = select(Strategy).where(
        Strategy.strategy_type.in_(["manual", "code", "parameter"])
    ).order_by(Strategy.updated_at.desc())
    result = await db.execute(q)
    rows = result.scalars().all()

    strategies = []
    for s in rows:
        strategies.append({
            "id": s.id,
            "name": s.name,
            "type": s.strategy_type,
            "description": s.description or "",
            "has_code": bool(s.code),
            "filter_count": len(json.loads(s.filters)) if s.filters else 0,
        })
    return json.dumps({"count": len(strategies), "strategies": strategies})


async def _tool_load_strategy(inputs: dict, db: AsyncSession) -> str:
    sid = inputs["strategy_id"]
    result = await db.execute(select(Strategy).where(Strategy.id == sid))
    s = result.scalar_one_or_none()
    if not s:
        return json.dumps({"error": f"Strategy {sid} not found"})

    return json.dumps({
        "id": s.id,
        "name": s.name,
        "type": s.strategy_type,
        "code": s.code or "",
        "filters": json.loads(s.filters) if s.filters else [],
        "index_filter": s.index_filter or "",
        "description": s.description or "",
    })


async def _tool_create_batch(inputs: dict, db: AsyncSession) -> str:
    batch = Batch(
        name=inputs["name"],
        symbols=",".join(inputs["symbols"]),
    )
    db.add(batch)
    await db.commit()
    await db.refresh(batch)

    log_event(f"Agent created batch: {batch.name} ({len(inputs['symbols'])} stocks)", source="agent", level="success")
    return json.dumps({
        "id": batch.id,
        "name": batch.name,
        "symbols": inputs["symbols"],
        "status": "created",
    })


async def _tool_list_batches(db: AsyncSession) -> str:
    result = await db.execute(select(Batch).order_by(Batch.updated_at.desc()))
    batches = []
    for b in result.scalars().all():
        symbols = [s.strip() for s in b.symbols.split(",") if s.strip()]
        batches.append({"id": b.id, "name": b.name, "symbol_count": len(symbols), "symbols": symbols[:10]})
    return json.dumps({"count": len(batches), "batches": batches})


async def _tool_get_snapshot(inputs: dict, db: AsyncSession) -> str:
    symbols = set(inputs.get("symbols", []))
    if not symbols:
        return json.dumps({"error": "No symbols provided"})

    values = await snapshot_service.get_snapshot_values(db, symbols)

    result = {}
    for sym in symbols:
        v = values.get(sym)
        if v:
            key_metrics = {
                k: v[k] for k in [
                    "close", "rsi_14", "sma_20", "sma_50", "sma_200",
                    "macd", "atr_14", "return_1d", "return_5d", "return_20d",
                    "volume_ratio_20d", "rvol", "_liquid",
                ] if k in v
            }
            result[sym] = key_metrics
        else:
            result[sym] = {"note": "No snapshot data available"}
    return json.dumps(result)


async def _tool_run_backtest(inputs: dict, db: AsyncSession) -> str:
    from app.services.backtest_engine import run_backtest
    from app.services.mock_data import generate_ohlcv

    code = inputs["code"]
    symbols = [s.upper() for s in inputs.get("symbols", [])[:20]]
    initial_capital = inputs.get("initial_capital", 100000)
    stop_loss_pct = inputs.get("stop_loss_pct", 5.0)
    target_pct = inputs.get("target_pct", 10.0)

    candles_by_symbol: dict[str, list] = {}
    for sym in symbols:
        stored = await snapshot_service.get_stored_candles(db, sym)
        candles_by_symbol[sym] = stored if stored else generate_ohlcv(sym, days=365, interval="day")

    result = run_backtest(
        code=code, symbols=symbols,
        candles_by_symbol=candles_by_symbol,
        initial_capital=initial_capital,
        stop_loss_pct=stop_loss_pct,
        target_pct=target_pct,
    )

    log_event(
        f"Agent backtest: {len(symbols)} symbols → {result.get('total_return_pct', 0):.1f}% return, "
        f"{result.get('win_rate', 0):.0f}% win rate",
        source="agent", level="success"
    )

    metrics = {k: result[k] for k in [
        "total_return_pct", "win_rate", "profit_factor", "sharpe_ratio",
        "sortino_ratio", "max_drawdown", "total_trades", "expectancy",
        "winning_trades", "losing_trades",
    ] if k in result}
    trades = result.get("trades", [])[:10]

    return json.dumps({
        "metrics": metrics,
        "trade_sample": trades,
        "total_trades": result.get("total_trades", 0),
        "note": f"Showing first 10 of {result.get('total_trades', 0)} trades" if result.get("total_trades", 0) > 10 else None,
    })
