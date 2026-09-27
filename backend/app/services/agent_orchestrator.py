"""AI Agent orchestrator — multi-provider tool-calling loop for the Stock Picker chatbot.

Supports OpenAI, Anthropic, DeepSeek (OpenAI-compatible), and Ollama (OpenAI-compatible).
"""
from __future__ import annotations

import json
import os
import time

from openai import OpenAI, APIError as OpenAIAPIError
from anthropic import Anthropic, APIError as AnthropicAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.agent_tools import TOOL_DEFINITIONS, execute_tool
from app.services.event_log import log_event

MAX_TOKENS = 16000
MAX_TOOL_ROUNDS = 10

PROVIDER_MODELS = {
    "openai": [
        {"id": "gpt-4o", "name": "GPT-4o"},
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
        {"id": "gpt-4-turbo", "name": "GPT-4 Turbo"},
        {"id": "o3-mini", "name": "o3-mini"},
    ],
    "anthropic": [
        {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4"},
        {"id": "claude-haiku-4-5-20251001", "name": "Claude Haiku 4.5"},
        {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet"},
    ],
    "deepseek": [
        {"id": "deepseek-chat", "name": "DeepSeek V3"},
        {"id": "deepseek-reasoner", "name": "DeepSeek R1"},
    ],
    "ollama": [
        {"id": "llama3.1", "name": "Llama 3.1 8B"},
        {"id": "llama3.1:70b", "name": "Llama 3.1 70B"},
        {"id": "mistral", "name": "Mistral 7B"},
        {"id": "codellama", "name": "Code Llama"},
        {"id": "deepseek-coder-v2", "name": "DeepSeek Coder V2"},
    ],
}

SYSTEM_PROMPT_PICKER = """You are an AI stock picking assistant integrated into a trading platform. You have tools to:

1. **Screen stocks** — Create filter-based strategies using 473+ indicators (RSI, moving averages, returns, volume ratios, etc.)
2. **Run code strategies** — Execute Python code strategies using the ZerodhaSDK
3. **Save/load strategies** — Persist strategies for reuse
4. **Manage batches** — Create watchlists of stocks
5. **Backtest** — Test strategies against historical data
6. **View data** — Get real indicator values for any stock

When the user asks you to find stocks, create a strategy, or analyze something:
- Use `list_indicators` first if you need to know what indicators are available
- Use `run_manual_strategy` for filter-based screening
- Use `run_code_strategy` for complex logic
- Use `save_strategy` to persist anything the user wants to keep
- Use `create_batch` to group stock results into a watchlist
- Use `run_backtest` to test strategy performance
- Use `get_snapshot_data` to look at specific stock metrics

Always explain what you're doing and show results clearly. Format numbers nicely.
When creating strategies, prefer using real indicator IDs from the catalog.
When showing results, highlight the key findings (how many stocks matched, top picks, key metrics).

For code strategies, the function signature is:
- Stock Picker: `pick_stocks(sdk)` — returns list of {symbol, price, criteria}
- Analyzer: `analyze_stocks(sdk, symbols)` — returns list of {symbol, signal, reason, entry_price, stop_loss, target}

SDK methods: sdk.get_universe(index), sdk.get_historical(symbol, days), sdk.get_quote(symbol)
"""

SYSTEM_PROMPT_ANALYZER = """You are an AI stock analysis assistant integrated into a trading platform's Stock Analyzer module. The user is analyzing specific stocks — your job is to help them understand the data, generate strategies, and provide actionable insights.

You have tools to:
1. **Screen stocks** — Filter-based screening using 473+ indicators
2. **Run code strategies** — Execute Python analysis code using the ZerodhaSDK
3. **Get indicator data** — Fetch real indicator values for any stock
4. **Backtest** — Test strategies against historical data
5. **Save/load strategies** — Persist strategies for reuse

When helping with analysis:
- Use `get_snapshot_data` to look at specific stock metrics before giving opinions
- Use `run_code_strategy` for custom analysis logic
- Use `run_backtest` to validate any strategy suggestion
- When generating code, use the `analyze_stocks(sdk, symbols)` function signature
- Return: list of {symbol, signal ("BUY"/"SELL"/"HOLD"), reason, entry_price, stop_loss, target}

When summarizing results:
- Lead with the overall verdict (how many BUY/SELL/HOLD signals)
- Highlight strongest signals with clear reasoning
- Include risk metrics (stop loss levels, risk/reward ratios)
- Note any conflicting signals or unusual patterns
- End with a brief recommendation

SDK methods: sdk.get_universe(index), sdk.get_historical(symbol, days), sdk.get_quote(symbol)

Always be specific with numbers. Format prices as ₹X,XXX.XX. Show percentages to 1 decimal.
"""

SYSTEM_PROMPT = SYSTEM_PROMPT_PICKER


def _convert_tools_to_openai(tools: list[dict]) -> list[dict]:
    """Convert our tool definitions to OpenAI function calling format."""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"],
            },
        }
        for t in tools
    ]


def _convert_tools_to_anthropic(tools: list[dict]) -> list[dict]:
    """Convert our tool definitions to Anthropic format."""
    return [
        {
            "name": t["name"],
            "description": t["description"],
            "input_schema": t["input_schema"],
        }
        for t in tools
    ]


# --- Provider state ---
_state: dict = {
    "provider": None,
    "api_key": None,
    "model": None,
    "ollama_url": "http://localhost:11434",
}


def set_provider_config(provider: str, api_key: str | None, model: str | None = None,
                        ollama_url: str | None = None) -> None:
    _state["provider"] = provider
    _state["api_key"] = api_key
    if model:
        _state["model"] = model
    elif provider in PROVIDER_MODELS:
        _state["model"] = PROVIDER_MODELS[provider][0]["id"]
    if ollama_url:
        _state["ollama_url"] = ollama_url


def set_model(model: str) -> None:
    _state["model"] = model


def get_provider_config() -> dict:
    return {
        "provider": _state["provider"],
        "model": _state["model"],
        "ollama_url": _state["ollama_url"],
        "has_key": bool(_state["api_key"]),
    }


def _get_config() -> tuple[str | None, str | None, str | None]:
    """Returns (provider, api_key, model)."""
    provider = _state["provider"]
    api_key = _state["api_key"]
    model = _state["model"]

    if not provider:
        key = os.getenv("OPENAI_API_KEY")
        if key:
            return "openai", key, model or "gpt-4o"
        return None, None, None

    return provider, api_key, model


OPENAI_TOOLS = _convert_tools_to_openai(TOOL_DEFINITIONS)
ANTHROPIC_TOOLS = _convert_tools_to_anthropic(TOOL_DEFINITIONS)


async def _run_openai_provider(
    messages: list[dict],
    api_key: str,
    model: str,
    base_url: str | None = None,
    db: AsyncSession | None = None,
) -> dict:
    """Run the OpenAI-compatible tool loop (OpenAI, DeepSeek, Ollama)."""
    client = OpenAI(api_key=api_key, base_url=base_url) if base_url else OpenAI(api_key=api_key)

    tool_calls_log: list[dict] = []
    extracted_code: str | None = None
    extracted_conditions: dict | None = None

    for round_num in range(MAX_TOOL_ROUNDS):
        start = time.time()
        try:
            kwargs = dict(
                model=model,
                max_tokens=MAX_TOKENS,
                messages=messages,
            )
            # Only pass tools if model likely supports them
            if not model.startswith("deepseek-reasoner"):
                kwargs["tools"] = OPENAI_TOOLS
                kwargs["tool_choice"] = "auto"
            response = client.chat.completions.create(**kwargs)
        except (OpenAIAPIError, Exception) as e:
            log_event(f"Agent API error: {e}", source="agent", level="error")
            return {"response": f"AI service error: {e}", "code": None, "conditions": None, "tool_calls": tool_calls_log}

        elapsed = time.time() - start
        choice = response.choices[0]
        finish_reason = choice.finish_reason

        log_event(f"Agent round {round_num + 1}: finish_reason={finish_reason}, {elapsed:.1f}s", source="agent", level="info")

        if finish_reason in ("stop", "length"):
            final_text = choice.message.content or ""
            code_in_response = _extract_code_block(final_text)
            if code_in_response:
                extracted_code = code_in_response
            log_event(f"Agent done: {len(tool_calls_log)} tool calls, response {len(final_text)} chars", source="agent", level="success")
            return {"response": final_text, "code": extracted_code, "conditions": extracted_conditions, "tool_calls": tool_calls_log}

        if finish_reason == "tool_calls":
            assistant_msg = choice.message
            messages.append({
                "role": "assistant",
                "content": assistant_msg.content,
                "tool_calls": [
                    {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in assistant_msg.tool_calls
                ],
            })

            for tc in assistant_msg.tool_calls:
                tool_name = tc.function.name
                try:
                    tool_input = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    tool_input = {}
                if not isinstance(tool_input, dict):
                    tool_input = {}

                log_event(f"Agent calling: {tool_name}", source="agent", level="info")
                result_str = await execute_tool(tool_name, tool_input, db)

                tool_calls_log.append({"tool": tool_name, "input": tool_input, "output_preview": result_str[:500]})
                _track_extractions(tool_name, tool_input, result_str, extracted_code, extracted_conditions)

                if tool_name in ("run_code_strategy", "run_backtest"):
                    code = tool_input.get("code")
                    if code:
                        extracted_code = code
                if tool_name == "run_manual_strategy":
                    filters = tool_input.get("filters", [])
                    if filters:
                        extracted_conditions = {"entry": filters}

                messages.append({"role": "tool", "tool_call_id": tc.id, "content": result_str})
            continue

        final_text = choice.message.content or "I'm not sure how to help with that."
        return {"response": final_text, "code": extracted_code, "conditions": extracted_conditions, "tool_calls": tool_calls_log}

    log_event("Agent hit max tool rounds", source="agent", level="warn")
    return {"response": "I've completed the maximum number of operations. Here's what I found so far.", "code": extracted_code, "conditions": extracted_conditions, "tool_calls": tool_calls_log}


async def _run_anthropic_provider(
    user_messages: list[dict],
    system: str,
    api_key: str,
    model: str,
    db: AsyncSession | None = None,
) -> dict:
    """Run the Anthropic tool-calling loop."""
    client = Anthropic(api_key=api_key)

    # Convert from OpenAI message format to Anthropic format
    messages = []
    for m in user_messages:
        if m["role"] == "system":
            continue
        if m["role"] in ("user", "assistant"):
            messages.append({"role": m["role"], "content": m["content"] or ""})

    tool_calls_log: list[dict] = []
    extracted_code: str | None = None
    extracted_conditions: dict | None = None

    for round_num in range(MAX_TOOL_ROUNDS):
        start = time.time()
        try:
            response = client.messages.create(
                model=model,
                max_tokens=MAX_TOKENS,
                system=system,
                messages=messages,
                tools=ANTHROPIC_TOOLS,
            )
        except (AnthropicAPIError, Exception) as e:
            log_event(f"Agent API error: {e}", source="agent", level="error")
            return {"response": f"AI service error: {e}", "code": None, "conditions": None, "tool_calls": tool_calls_log}

        elapsed = time.time() - start
        stop_reason = response.stop_reason
        log_event(f"Agent round {round_num + 1}: stop_reason={stop_reason}, {elapsed:.1f}s", source="agent", level="info")

        if stop_reason == "end_turn" or stop_reason == "max_tokens":
            final_text = ""
            for block in response.content:
                if hasattr(block, "text"):
                    final_text += block.text
            code_in_response = _extract_code_block(final_text)
            if code_in_response:
                extracted_code = code_in_response
            log_event(f"Agent done: {len(tool_calls_log)} tool calls, response {len(final_text)} chars", source="agent", level="success")
            return {"response": final_text, "code": extracted_code, "conditions": extracted_conditions, "tool_calls": tool_calls_log}

        if stop_reason == "tool_use":
            # Build assistant message content
            assistant_content = []
            for block in response.content:
                if hasattr(block, "text"):
                    assistant_content.append({"type": "text", "text": block.text})
                elif block.type == "tool_use":
                    assistant_content.append({"type": "tool_use", "id": block.id, "name": block.name, "input": block.input})
            messages.append({"role": "assistant", "content": assistant_content})

            # Execute tool calls
            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                tool_name = block.name
                tool_input = block.input

                log_event(f"Agent calling: {tool_name}", source="agent", level="info")
                result_str = await execute_tool(tool_name, tool_input, db)

                tool_calls_log.append({"tool": tool_name, "input": tool_input, "output_preview": result_str[:500]})

                if tool_name in ("run_code_strategy", "run_backtest"):
                    code = tool_input.get("code")
                    if code:
                        extracted_code = code
                if tool_name == "run_manual_strategy":
                    filters = tool_input.get("filters", [])
                    if filters:
                        extracted_conditions = {"entry": filters}

                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": result_str})

            messages.append({"role": "user", "content": tool_results})
            continue

        final_text = ""
        for block in response.content:
            if hasattr(block, "text"):
                final_text += block.text
        return {"response": final_text or "I'm not sure how to help with that.", "code": extracted_code, "conditions": extracted_conditions, "tool_calls": tool_calls_log}

    log_event("Agent hit max tool rounds", source="agent", level="warn")
    return {"response": "I've completed the maximum number of operations.", "code": extracted_code, "conditions": extracted_conditions, "tool_calls": tool_calls_log}


def _track_extractions(tool_name, tool_input, result_str, extracted_code, extracted_conditions):
    try:
        result_data = json.loads(result_str)
        if isinstance(result_data, dict) and "results" in result_data:
            count = result_data.get("matched", len(result_data["results"]))
            log_event(f"Agent tool result: {tool_name} → {count} results", source="agent", level="info")
    except (json.JSONDecodeError, KeyError):
        pass


async def run_agent(
    message: str,
    db: AsyncSession,
    conversation_history: list[dict] | None = None,
    system_prompt: str | None = None,
    attachments: list[dict] | None = None,
    tab: str = "picker",
    context: dict | None = None,
) -> dict:
    """Run the agent loop. Returns {response, code, conditions, tool_calls}."""
    provider, api_key, model = _get_config()

    if not provider or (provider != "ollama" and not api_key):
        return {
            "response": "No API key configured. Please select a provider and enter your API key using the key icon above.",
            "code": None,
            "conditions": None,
            "tool_calls": [],
        }

    default_prompt = SYSTEM_PROMPT_ANALYZER if tab == "analyzer" else SYSTEM_PROMPT_PICKER
    system = system_prompt or default_prompt
    if attachments:
        attachment_text = "\n\n--- Attached Strategies ---\n"
        for a in attachments:
            attachment_text += f"\n### {a.get('name', 'Strategy')}\n```python\n{a.get('code', '')}\n```\n"
        system += attachment_text
    if context:
        context_text = "\n\n--- Current Analyzer Context ---\n"
        if context.get("selected_symbol"):
            context_text += f"Currently viewing: {context['selected_symbol']}\n"
        if context.get("selected_stocks"):
            context_text += f"Stocks in analyzer: {', '.join(context['selected_stocks'][:20])}\n"
        if context.get("active_indicators"):
            context_text += f"Active indicators on chart: {', '.join(context['active_indicators'])}\n"
        if context.get("signal_results"):
            signals = context["signal_results"]
            context_text += f"\n### Latest Signal Results ({len(signals)} stocks)\n"
            for s in signals[:15]:
                sig = s.get("signal", "N/A")
                sym = s.get("symbol", "?")
                reason = s.get("reason", "")
                entry = s.get("entry_price")
                sl = s.get("stop_loss")
                tgt = s.get("target")
                context_text += f"- **{sym}**: {sig}"
                if entry: context_text += f" | Entry: ₹{entry}"
                if sl: context_text += f" | SL: ₹{sl}"
                if tgt: context_text += f" | Target: ₹{tgt}"
                if reason: context_text += f" | {reason}"
                context_text += "\n"
            if len(signals) > 15:
                context_text += f"... and {len(signals) - 15} more signals\n"
        if context.get("code"):
            context_text += f"\n### Current Strategy Code\n```python\n{context['code']}\n```\n"
        system += context_text

    log_event(f"Agent [{provider}/{model}] received: {message[:100]}{'...' if len(message) > 100 else ''}", source="agent", level="info")

    messages: list[dict] = [{"role": "system", "content": system}]
    if conversation_history:
        messages.extend(conversation_history)
    messages.append({"role": "user", "content": message})

    if provider == "anthropic":
        return await _run_anthropic_provider(messages, system, api_key, model, db)

    base_url = None
    if provider == "deepseek":
        base_url = "https://api.deepseek.com"
    elif provider == "ollama":
        base_url = f"{_state['ollama_url']}/v1"
        api_key = "ollama"

    return await _run_openai_provider(messages, api_key, model, base_url, db)


def _extract_code_block(text: str) -> str | None:
    import re
    pattern = r"```python\n(.*?)```"
    match = re.search(pattern, text, re.DOTALL)
    if match:
        code = match.group(1).strip()
        if "def pick_stocks" in code or "def analyze_stocks" in code:
            return code
    return None
