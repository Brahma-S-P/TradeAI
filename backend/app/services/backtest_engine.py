"""Bar-by-bar backtest engine for analyzer strategies.

Supports long and short trades, trailing stops, slippage, commissions,
benchmark comparison, and rich trade analytics.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime

from app.services.mock_data import generate_ohlcv
from app.services.event_log import log_event


@dataclass
class Trade:
    symbol: str
    direction: str  # "long" | "short"
    entry_date: str
    entry_price: float
    exit_date: str = ""
    exit_price: float = 0.0
    pnl: float = 0.0
    pnl_pct: float = 0.0
    exit_reason: str = ""
    quantity: int = 0
    holding_bars: int = 0
    peak_price: float = 0.0

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "direction": self.direction,
            "entry_date": self.entry_date,
            "entry_price": self.entry_price,
            "exit_date": self.exit_date,
            "exit_price": self.exit_price,
            "pnl": round(self.pnl, 2),
            "pnl_pct": round(self.pnl_pct, 2),
            "exit_reason": self.exit_reason,
            "quantity": self.quantity,
            "holding_bars": self.holding_bars,
        }


@dataclass
class BacktestResult:
    trades: list[dict] = field(default_factory=list)
    equity_curve: list[dict] = field(default_factory=list)
    benchmark_curve: list[dict] = field(default_factory=list)
    drawdown_curve: list[dict] = field(default_factory=list)
    monthly_returns: list[dict] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)
    signals_by_date: dict = field(default_factory=dict)


class _BacktestSDK:
    """A restricted ZerodhaSDK that only sees data up to the current bar."""

    def __init__(self, symbols: list[str], candles_by_symbol: dict, bar_index: int):
        self._symbols = symbols
        self._candles = candles_by_symbol
        self._bar_index = bar_index

    def get_universe(self, index_name: str | None = None) -> list[str]:
        return list(self._symbols)

    def get_historical(self, symbol: str, days: int = 20) -> list[dict]:
        stored = self._candles.get(symbol, [])
        visible = stored[: self._bar_index + 1]
        return visible[-days:] if days else visible

    def get_quote(self, symbol: str) -> dict:
        stored = self._candles.get(symbol, [])
        if self._bar_index < len(stored):
            return {"symbol": symbol, "ltp": stored[self._bar_index]["close"]}
        return {"symbol": symbol, "ltp": 0}


def _apply_slippage(price: float, direction: str, slippage_bps: float) -> float:
    factor = slippage_bps / 10000
    if direction == "buy":
        return round(price * (1 + factor), 2)
    return round(price * (1 - factor), 2)


def _compute_commission(price: float, qty: int, commission_pct: float) -> float:
    return round(price * qty * commission_pct / 100, 2)


def run_backtest(
    code: str,
    symbols: list[str],
    candles_by_symbol: dict[str, list[dict]],
    initial_capital: float = 100000,
    stop_loss_pct: float = 5.0,
    target_pct: float = 10.0,
    max_positions: int = 10,
    trailing_stop_pct: float = 0.0,
    slippage_bps: float = 5.0,
    commission_pct: float = 0.03,
    warmup_bars: int = 30,
) -> BacktestResult:
    namespace: dict = {}
    try:
        exec(code, {"__builtins__": __builtins__}, namespace)
    except Exception as e:
        raise ValueError(f"Code compile error: {e}")

    analyze_fn = namespace.get("analyze_stocks")
    pick_fn = namespace.get("pick_stocks")
    if callable(analyze_fn):
        pass
    elif callable(pick_fn):
        def analyze_fn(sdk, symbols):
            raw = pick_fn(sdk)
            results = []
            for r in raw or []:
                sym = r.get("symbol", "")
                if sym in symbols:
                    results.append({
                        "symbol": sym,
                        "signal": "buy",
                        "reason": r.get("matched_criteria", "picked"),
                        "entry_price": r.get("price", 0),
                        "target": 0,
                        "stop_loss": 0,
                    })
            return results
    else:
        raise ValueError("Code must define analyze_stocks(sdk, symbols) or pick_stocks(sdk)")

    if not symbols or not candles_by_symbol:
        return BacktestResult(metrics=_empty_metrics(initial_capital))

    max_bars = max(len(candles_by_symbol.get(s, [])) for s in symbols)
    if max_bars == 0:
        return BacktestResult(metrics=_empty_metrics(initial_capital))

    capital = initial_capital
    total_commissions = 0.0
    open_positions: dict[str, Trade] = {}
    closed_trades: list[Trade] = []
    equity_curve: list[dict] = []
    signals_by_date: dict[str, list[dict]] = {}
    position_size = initial_capital / max_positions

    ref_symbol = symbols[0]
    ref_candles = candles_by_symbol.get(ref_symbol, [])

    # Benchmark: buy-and-hold equal weight across all symbols from warmup start
    benchmark_start_prices: dict[str, float] = {}
    for sym in symbols:
        c = candles_by_symbol.get(sym, [])
        if warmup_bars < len(c):
            benchmark_start_prices[sym] = c[warmup_bars]["close"]

    for bar_idx in range(warmup_bars, max_bars):
        bar_date = ref_candles[bar_idx]["date"] if bar_idx < len(ref_candles) else f"bar_{bar_idx}"

        sdk = _BacktestSDK(symbols, candles_by_symbol, bar_idx)
        try:
            raw_signals = analyze_fn(sdk, symbols)
        except Exception:
            raw_signals = []

        signal_map: dict[str, dict] = {}
        for sig in raw_signals or []:
            sym = sig.get("symbol")
            if sym:
                signal_map[sym] = sig
                signals_by_date.setdefault(bar_date, []).append(sig)

        # --- EXIT LOGIC ---
        symbols_to_close = []
        for sym, pos in open_positions.items():
            candles = candles_by_symbol.get(sym, [])
            if bar_idx >= len(candles):
                continue
            current_price = candles[bar_idx]["close"]
            pos.holding_bars += 1

            if pos.direction == "long":
                pnl_pct = (current_price / pos.entry_price - 1) * 100
                if current_price > pos.peak_price:
                    pos.peak_price = current_price
            else:
                pnl_pct = (pos.entry_price / current_price - 1) * 100 if current_price > 0 else 0
                if current_price < pos.peak_price or pos.peak_price == 0:
                    pos.peak_price = current_price

            sig = signal_map.get(sym, {})
            sig_type = sig.get("signal", "").lower()

            exit_reason = ""

            # Trailing stop check (if enabled)
            if trailing_stop_pct > 0 and pos.peak_price > 0:
                if pos.direction == "long":
                    trail_stop_price = pos.peak_price * (1 - trailing_stop_pct / 100)
                    if current_price <= trail_stop_price:
                        exit_reason = "trailing_stop"
                else:
                    trail_stop_price = pos.peak_price * (1 + trailing_stop_pct / 100)
                    if current_price >= trail_stop_price:
                        exit_reason = "trailing_stop"

            if not exit_reason and pnl_pct <= -stop_loss_pct:
                exit_reason = "stop_loss"
            elif not exit_reason and pnl_pct >= target_pct:
                exit_reason = "target"
            elif not exit_reason:
                if pos.direction == "long" and sig_type == "sell":
                    exit_reason = "signal"
                elif pos.direction == "short" and sig_type == "buy":
                    exit_reason = "signal"

            if exit_reason:
                exit_price = _apply_slippage(current_price, "sell" if pos.direction == "long" else "buy", slippage_bps)
                comm = _compute_commission(exit_price, pos.quantity, commission_pct)
                total_commissions += comm

                if pos.direction == "long":
                    pos.pnl = (exit_price - pos.entry_price) * pos.quantity - comm
                    pos.pnl_pct = (exit_price / pos.entry_price - 1) * 100
                else:
                    pos.pnl = (pos.entry_price - exit_price) * pos.quantity - comm
                    pos.pnl_pct = (pos.entry_price / exit_price - 1) * 100 if exit_price > 0 else 0

                pos.exit_date = bar_date
                pos.exit_price = exit_price
                pos.exit_reason = exit_reason
                symbols_to_close.append(sym)

        for sym in symbols_to_close:
            pos = open_positions.pop(sym)
            if pos.direction == "long":
                capital += pos.exit_price * pos.quantity
            else:
                capital += pos.entry_price * pos.quantity + pos.pnl
            closed_trades.append(pos)

        # --- ENTRY LOGIC ---
        for sym in symbols:
            if sym in open_positions:
                continue
            if len(open_positions) >= max_positions:
                break
            sig = signal_map.get(sym, {})
            sig_type = sig.get("signal", "").lower()
            if sig_type not in ("buy", "sell", "short"):
                continue

            candles = candles_by_symbol.get(sym, [])
            if bar_idx >= len(candles):
                continue
            raw_price = candles[bar_idx]["close"]
            if raw_price <= 0:
                continue

            direction = "long" if sig_type == "buy" else "short"
            entry_price = _apply_slippage(raw_price, "buy" if direction == "long" else "sell", slippage_bps)

            qty = max(1, int(position_size / entry_price))
            cost = entry_price * qty
            comm = _compute_commission(entry_price, qty, commission_pct)
            total_commissions += comm

            if direction == "long":
                total_cost = cost + comm
                if total_cost > capital:
                    qty = max(1, int((capital - comm) / entry_price))
                    cost = entry_price * qty
                    total_cost = cost + comm
                if total_cost > capital:
                    continue
                capital -= total_cost
            else:
                margin_required = cost * 0.5 + comm
                if margin_required > capital:
                    continue
                capital -= margin_required

            open_positions[sym] = Trade(
                symbol=sym,
                direction=direction,
                entry_date=bar_date,
                entry_price=entry_price,
                quantity=qty,
                peak_price=entry_price,
            )

        # --- PORTFOLIO VALUE ---
        portfolio_value = capital
        for sym, pos in open_positions.items():
            candles = candles_by_symbol.get(sym, [])
            if bar_idx < len(candles):
                price = candles[bar_idx]["close"]
                if pos.direction == "long":
                    portfolio_value += price * pos.quantity
                else:
                    portfolio_value += pos.entry_price * pos.quantity + (pos.entry_price - price) * pos.quantity

        equity_curve.append({"date": bar_date, "value": round(portfolio_value, 2)})

    # Close remaining positions at end
    for sym, pos in list(open_positions.items()):
        candles = candles_by_symbol.get(sym, [])
        last_bar = max_bars - 1
        price = candles[last_bar]["close"] if last_bar < len(candles) else pos.entry_price
        exit_price = _apply_slippage(price, "sell" if pos.direction == "long" else "buy", slippage_bps)
        comm = _compute_commission(exit_price, pos.quantity, commission_pct)
        total_commissions += comm

        if pos.direction == "long":
            pos.pnl = (exit_price - pos.entry_price) * pos.quantity - comm
            pos.pnl_pct = (exit_price / pos.entry_price - 1) * 100
        else:
            pos.pnl = (pos.entry_price - exit_price) * pos.quantity - comm
            pos.pnl_pct = (pos.entry_price / exit_price - 1) * 100 if exit_price > 0 else 0

        pos.exit_date = equity_curve[-1]["date"] if equity_curve else pos.entry_date
        pos.exit_price = exit_price
        pos.exit_reason = "end_of_data"
        closed_trades.append(pos)

    # Benchmark curve (equal-weight buy & hold)
    benchmark_curve = _compute_benchmark(
        symbols, candles_by_symbol, benchmark_start_prices,
        initial_capital, warmup_bars, max_bars, ref_candles,
    )

    # Drawdown curve
    drawdown_curve = _compute_drawdown_curve(equity_curve, initial_capital)

    # Monthly returns
    monthly_returns = _compute_monthly_returns(equity_curve)

    # Metrics
    metrics = _compute_metrics(closed_trades, equity_curve, initial_capital, total_commissions)

    return BacktestResult(
        trades=[t.to_dict() for t in closed_trades],
        equity_curve=equity_curve,
        benchmark_curve=benchmark_curve,
        drawdown_curve=drawdown_curve,
        monthly_returns=monthly_returns,
        metrics=metrics,
        signals_by_date=signals_by_date,
    )


def _compute_benchmark(
    symbols: list[str], candles_by_symbol: dict, start_prices: dict,
    initial_capital: float, warmup: int, max_bars: int,
    ref_candles: list[dict],
) -> list[dict]:
    if not start_prices:
        return []
    alloc_per_sym = initial_capital / len(start_prices)
    shares: dict[str, float] = {}
    for sym, price in start_prices.items():
        shares[sym] = alloc_per_sym / price if price > 0 else 0

    curve = []
    for bar_idx in range(warmup, max_bars):
        bar_date = ref_candles[bar_idx]["date"] if bar_idx < len(ref_candles) else f"bar_{bar_idx}"
        value = 0.0
        for sym, qty in shares.items():
            candles = candles_by_symbol.get(sym, [])
            if bar_idx < len(candles):
                value += candles[bar_idx]["close"] * qty
        curve.append({"date": bar_date, "value": round(value, 2)})
    return curve


def _compute_drawdown_curve(equity_curve: list[dict], initial_capital: float) -> list[dict]:
    if not equity_curve:
        return []
    peak = initial_capital
    curve = []
    for pt in equity_curve:
        v = pt["value"]
        if v > peak:
            peak = v
        dd_pct = (peak - v) / peak * 100 if peak > 0 else 0
        curve.append({"date": pt["date"], "drawdown": round(dd_pct, 2)})
    return curve


def _compute_monthly_returns(equity_curve: list[dict]) -> list[dict]:
    if len(equity_curve) < 2:
        return []
    monthly: dict[str, dict] = {}
    for pt in equity_curve:
        date_str = pt["date"][:7]  # YYYY-MM
        if date_str not in monthly:
            monthly[date_str] = {"start": pt["value"], "end": pt["value"]}
        monthly[date_str]["end"] = pt["value"]

    result = []
    prev_end = None
    for month, vals in monthly.items():
        start = prev_end if prev_end is not None else vals["start"]
        end = vals["end"]
        ret = (end / start - 1) * 100 if start > 0 else 0
        parts = month.split("-")
        result.append({
            "year": int(parts[0]),
            "month": int(parts[1]),
            "return_pct": round(ret, 2),
            "start_value": round(start, 2),
            "end_value": round(end, 2),
        })
        prev_end = end
    return result


def _empty_metrics(initial_capital: float) -> dict:
    return {
        "initial_capital": initial_capital,
        "final_value": initial_capital,
        "total_return": 0,
        "total_return_pct": 0,
        "total_trades": 0,
        "winning_trades": 0,
        "losing_trades": 0,
        "win_rate": 0,
        "avg_win": 0,
        "avg_loss": 0,
        "avg_win_loss_ratio": 0,
        "profit_factor": 0,
        "max_drawdown": 0,
        "max_drawdown_pct": 0,
        "max_drawdown_duration": 0,
        "sharpe_ratio": 0,
        "sortino_ratio": 0,
        "calmar_ratio": 0,
        "expectancy": 0,
        "total_commissions": 0,
        "best_trade": 0,
        "worst_trade": 0,
        "avg_holding_bars": 0,
        "max_consecutive_wins": 0,
        "max_consecutive_losses": 0,
        "long_trades": 0,
        "short_trades": 0,
        "long_pnl": 0,
        "short_pnl": 0,
        "time_in_market_pct": 0,
        "gross_profit": 0,
        "gross_loss": 0,
    }


def _compute_metrics(
    trades: list[Trade], equity_curve: list[dict], initial_capital: float,
    total_commissions: float = 0,
) -> dict:
    m = _empty_metrics(initial_capital)
    m["total_commissions"] = round(total_commissions, 2)

    if not equity_curve:
        return m

    final = equity_curve[-1]["value"]
    m["final_value"] = final
    m["total_return"] = round(final - initial_capital, 2)
    m["total_return_pct"] = round((final / initial_capital - 1) * 100, 2)

    if not trades:
        return m

    wins = [t for t in trades if t.pnl > 0]
    losses = [t for t in trades if t.pnl <= 0]
    longs = [t for t in trades if t.direction == "long"]
    shorts = [t for t in trades if t.direction == "short"]

    m["total_trades"] = len(trades)
    m["winning_trades"] = len(wins)
    m["losing_trades"] = len(losses)
    m["win_rate"] = round(len(wins) / len(trades) * 100, 2)

    avg_win = sum(t.pnl for t in wins) / len(wins) if wins else 0
    avg_loss = abs(sum(t.pnl for t in losses) / len(losses)) if losses else 0
    m["avg_win"] = round(avg_win, 2)
    m["avg_loss"] = round(avg_loss, 2)
    m["avg_win_loss_ratio"] = round(avg_win / avg_loss, 2) if avg_loss else 0

    gross_profit = sum(t.pnl for t in wins)
    gross_loss = abs(sum(t.pnl for t in losses))
    m["gross_profit"] = round(gross_profit, 2)
    m["gross_loss"] = round(gross_loss, 2)
    m["profit_factor"] = round(gross_profit / gross_loss, 2) if gross_loss else 0
    m["expectancy"] = round(sum(t.pnl for t in trades) / len(trades), 2)

    # Best / worst trade
    m["best_trade"] = round(max(t.pnl for t in trades), 2)
    m["worst_trade"] = round(min(t.pnl for t in trades), 2)

    # Avg holding period
    m["avg_holding_bars"] = round(sum(t.holding_bars for t in trades) / len(trades), 1)

    # Consecutive wins/losses
    max_cw, max_cl, cw, cl = 0, 0, 0, 0
    for t in trades:
        if t.pnl > 0:
            cw += 1
            cl = 0
        else:
            cl += 1
            cw = 0
        max_cw = max(max_cw, cw)
        max_cl = max(max_cl, cl)
    m["max_consecutive_wins"] = max_cw
    m["max_consecutive_losses"] = max_cl

    # Long / short breakdown
    m["long_trades"] = len(longs)
    m["short_trades"] = len(shorts)
    m["long_pnl"] = round(sum(t.pnl for t in longs), 2)
    m["short_pnl"] = round(sum(t.pnl for t in shorts), 2)

    # Time in market
    total_holding = sum(t.holding_bars for t in trades)
    total_bars = len(equity_curve)
    m["time_in_market_pct"] = round(total_holding / (total_bars * max(len(set(t.symbol for t in trades)), 1)) * 100, 1) if total_bars else 0

    # Drawdown
    peak = initial_capital
    max_dd = 0
    max_dd_duration = 0
    dd_start = 0
    for i, pt in enumerate(equity_curve):
        v = pt["value"]
        if v > peak:
            peak = v
            dd_start = i
        dd = (peak - v) / peak * 100 if peak else 0
        if dd > max_dd:
            max_dd = dd
            max_dd_duration = i - dd_start
    m["max_drawdown"] = round(max_dd, 2)
    m["max_drawdown_pct"] = round(max_dd, 2)
    m["max_drawdown_duration"] = max_dd_duration

    # Sharpe & Sortino
    daily_returns = []
    for i in range(1, len(equity_curve)):
        prev = equity_curve[i - 1]["value"]
        cur = equity_curve[i]["value"]
        if prev > 0:
            daily_returns.append((cur - prev) / prev)

    if len(daily_returns) >= 2:
        mean_r = sum(daily_returns) / len(daily_returns)
        std_r = math.sqrt(sum((r - mean_r) ** 2 for r in daily_returns) / (len(daily_returns) - 1))
        m["sharpe_ratio"] = round(mean_r / std_r * math.sqrt(252), 2) if std_r else 0

        downside = [r for r in daily_returns if r < 0]
        if downside:
            down_std = math.sqrt(sum(r ** 2 for r in downside) / len(downside))
            m["sortino_ratio"] = round(mean_r / down_std * math.sqrt(252), 2) if down_std else 0

    annual_return = m["total_return_pct"]
    m["calmar_ratio"] = round(annual_return / max_dd, 2) if max_dd else 0

    return m
