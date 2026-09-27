import { useState, useMemo } from "react";
import { cn } from "@/lib/cn";
import { PerformanceDashboard } from "./PerformanceDashboard";
import { EquityCurveChart } from "./EquityCurveChart";
import { TradeListTable } from "./TradeListTable";
import { DrawdownChart } from "./DrawdownChart";
import { MonthlyReturnsHeatmap } from "./MonthlyReturnsHeatmap";
import { PnLDistributionChart } from "./PnLDistributionChart";
import { TradeSignalChart } from "./TradeSignalChart";
import { WalkForwardPanel } from "./WalkForwardPanel";
import { ParamOptimizationPanel } from "./ParamOptimizationPanel";

export interface BacktestResult {
  id?: number;
  metrics: Record<string, number>;
  trades: Array<{
    symbol: string;
    direction: string;
    entry_date: string;
    entry_price: number;
    exit_date: string;
    exit_price: number;
    pnl: number;
    pnl_pct: number;
    exit_reason: string;
    quantity: number;
    holding_bars: number;
  }>;
  equity_curve: Array<{ date: string; value: number }>;
  benchmark_curve?: Array<{ date: string; value: number }>;
  drawdown_curve?: Array<{ date: string; drawdown: number }>;
  monthly_returns?: Array<{
    year: number;
    month: number;
    return_pct: number;
    start_value: number;
    end_value: number;
  }>;
  signals_by_date?: Record<string, unknown[]>;
}

interface BacktestResultsPanelProps {
  result: BacktestResult | null;
  loading?: boolean;
  code?: string;
  symbols?: string[];
}

const SUB_TABS = ["Dashboard", "Equity", "Signals", "Drawdown", "Monthly", "Distribution", "Trades", "Walk-Forward", "Optimize"] as const;
type SubTab = (typeof SUB_TABS)[number];

function SummaryStrip({ metrics, trades }: { metrics: Record<string, number>; trades: BacktestResult["trades"] }) {
  const items = useMemo(() => {
    const m = metrics;
    const ret = m.total_return_pct;
    const retColor = ret >= 0 ? "text-emerald-400" : "text-red-400";
    const benchReturn = m.benchmark_return_pct;
    const alpha = ret !== undefined && benchReturn !== undefined ? ret - benchReturn : undefined;

    return [
      { label: "Return", value: `${ret >= 0 ? "+" : ""}${ret?.toFixed(1) ?? "—"}%`, color: retColor },
      { label: "Sharpe", value: m.sharpe_ratio?.toFixed(2) ?? "—", color: (m.sharpe_ratio ?? 0) >= 1 ? "text-emerald-400" : (m.sharpe_ratio ?? 0) >= 0 ? "text-amber-400" : "text-red-400" },
      { label: "Max DD", value: `${m.max_drawdown?.toFixed(1) ?? "—"}%`, color: (m.max_drawdown ?? 0) > 20 ? "text-red-400" : (m.max_drawdown ?? 0) > 10 ? "text-amber-400" : "text-emerald-400" },
      { label: "Win Rate", value: `${m.win_rate?.toFixed(0) ?? "—"}%`, color: (m.win_rate ?? 0) >= 50 ? "text-emerald-400" : "text-red-400" },
      { label: "Trades", value: String(m.total_trades ?? trades.length), color: "text-slate-300" },
      { label: "PF", value: m.profit_factor?.toFixed(2) ?? "—", color: (m.profit_factor ?? 0) >= 1.5 ? "text-emerald-400" : (m.profit_factor ?? 0) >= 1 ? "text-amber-400" : "text-red-400" },
      ...(alpha !== undefined ? [{ label: "Alpha", value: `${alpha >= 0 ? "+" : ""}${alpha.toFixed(1)}%`, color: alpha >= 0 ? "text-emerald-400" : "text-red-400" }] : []),
    ];
  }, [metrics, trades]);

  return (
    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{item.label}</span>
          <span className={cn("font-mono text-xs font-bold", item.color)}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function BacktestResultsPanel({ result, loading, code = "", symbols = [] }: BacktestResultsPanelProps) {
  const [subTab, setSubTab] = useState<SubTab>("Dashboard");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mb-2 h-5 w-5 mx-auto animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span className="text-xs text-slate-400">Running backtest...</span>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="py-8 text-center text-xs text-slate-400">
        No backtest results yet. Run a backtest from the strategy code panel.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <SummaryStrip metrics={result.metrics} trades={result.trades} />

      <div className="flex items-center gap-1 flex-wrap">
        {SUB_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
              subTab === tab
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            )}
          >
            {tab}
            {tab === "Trades" && result.trades.length > 0 && (
              <span className="ml-1 text-[9px] opacity-70">{result.trades.length}</span>
            )}
          </button>
        ))}
      </div>

      {subTab === "Dashboard" && <PerformanceDashboard metrics={result.metrics} />}
      {subTab === "Equity" && (
        <EquityCurveChart
          data={result.equity_curve}
          benchmarkData={result.benchmark_curve}
          initialCapital={result.metrics.initial_capital || 100000}
        />
      )}
      {subTab === "Signals" && (
        <TradeSignalChart trades={result.trades} symbols={symbols} />
      )}
      {subTab === "Drawdown" && (
        <DrawdownChart data={result.drawdown_curve ?? []} />
      )}
      {subTab === "Monthly" && (
        <MonthlyReturnsHeatmap data={result.monthly_returns ?? []} />
      )}
      {subTab === "Distribution" && (
        <PnLDistributionChart trades={result.trades} />
      )}
      {subTab === "Trades" && <TradeListTable trades={result.trades} />}
      {subTab === "Walk-Forward" && <WalkForwardPanel code={code} symbols={symbols} />}
      {subTab === "Optimize" && <ParamOptimizationPanel code={code} symbols={symbols} />}
    </div>
  );
}
