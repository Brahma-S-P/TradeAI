import { useEffect, useState } from "react";
import { Trophy, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { apiFetch, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";

interface ScoredRun {
  run_id: number;
  strategy_name: string;
  rank: number;
  metrics: Record<string, number | null>;
  score: {
    composite: number;
    grade: string;
    components: Record<string, number>;
  };
}

interface BacktestRunSummary {
  id: number;
  strategy_id: number;
  total_return: number;
  win_rate: number;
  sharpe_ratio: number;
  total_trades: number;
  status: string;
  symbols: string[];
  created_at: string | null;
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-400 bg-emerald-500/10",
  B: "text-blue-400 bg-blue-500/10",
  C: "text-amber-400 bg-amber-500/10",
  D: "text-orange-400 bg-orange-500/10",
  F: "text-red-400 bg-red-500/10",
};

const METRIC_ROWS = [
  { key: "total_return_pct", label: "Total Return", format: "pct", higherBetter: true },
  { key: "win_rate", label: "Win Rate", format: "pct", higherBetter: true },
  { key: "profit_factor", label: "Profit Factor", format: "ratio", higherBetter: true },
  { key: "sharpe_ratio", label: "Sharpe Ratio", format: "ratio", higherBetter: true },
  { key: "sortino_ratio", label: "Sortino Ratio", format: "ratio", higherBetter: true },
  { key: "max_drawdown_pct", label: "Max Drawdown", format: "pct", higherBetter: false },
  { key: "expectancy", label: "Expectancy", format: "currency", higherBetter: true },
  { key: "total_trades", label: "Total Trades", format: "number", higherBetter: null },
  { key: "winning_trades", label: "Winning Trades", format: "number", higherBetter: true },
  { key: "losing_trades", label: "Losing Trades", format: "number", higherBetter: false },
  { key: "calmar_ratio", label: "Calmar Ratio", format: "ratio", higherBetter: true },
];

function formatValue(v: number | null | undefined, format: string): string {
  if (v === null || v === undefined) return "—";
  switch (format) {
    case "pct": return `${v.toFixed(1)}%`;
    case "ratio": return v.toFixed(2);
    case "currency": return `₹${v.toFixed(0)}`;
    case "number": return v.toFixed(0);
    default: return String(v);
  }
}

function bestInRow(values: (number | null | undefined)[], higherBetter: boolean | null): number {
  if (higherBetter === null) return -1;
  let bestIdx = -1;
  let bestVal = higherBetter ? -Infinity : Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    if (higherBetter ? v > bestVal : v < bestVal) {
      bestVal = v;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function StrategyComparisonTable() {
  const [runs, setRuns] = useState<BacktestRunSummary[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [comparison, setComparison] = useState<ScoredRun[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<BacktestRunSummary[]>("/backtest/runs")
      .then(setRuns)
      .catch(() => setRuns([]));
  }, []);

  async function handleCompare() {
    if (selected.size < 2) return;
    setLoading(true);
    try {
      const data = await apiPost<ScoredRun[]>("/backtest/compare", {
        run_ids: Array.from(selected),
      });
      setComparison(data);
    } catch {
      setComparison(null);
    }
    setLoading(false);
  }

  function toggleRun(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (comparison && comparison.length > 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Strategy Comparison
          </span>
          <button
            onClick={() => setComparison(null)}
            className="rounded px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Back
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="py-1.5 pr-3 text-left text-[10px] font-medium text-slate-500">Metric</th>
                {comparison.map((r) => (
                  <th key={r.run_id} className="px-2 py-1.5 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
                        {r.strategy_name}
                      </span>
                      <div className="flex items-center gap-1">
                        {r.rank === 1 && <Trophy size={10} className="text-amber-400" />}
                        <span className={cn(
                          "rounded-full px-1.5 py-px text-[9px] font-bold",
                          GRADE_COLORS[r.score.grade] || "text-slate-400"
                        )}>
                          {r.score.grade} ({r.score.composite})
                        </span>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRIC_ROWS.map((row) => {
                const values = comparison.map((r) => r.metrics[row.key]);
                const best = bestInRow(values, row.higherBetter);
                return (
                  <tr key={row.key} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-1 pr-3 text-[10px] text-slate-500">{row.label}</td>
                    {comparison.map((r, i) => (
                      <td
                        key={r.run_id}
                        className={cn(
                          "px-2 py-1 text-center font-mono",
                          best === i && "font-bold text-emerald-400"
                        )}
                      >
                        {formatValue(r.metrics[row.key], row.format)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr className="border-t-2 border-slate-300 dark:border-slate-600">
                <td className="py-1.5 pr-3 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                  Composite Score
                </td>
                {comparison.map((r) => (
                  <td key={r.run_id} className="px-2 py-1.5 text-center">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-bold",
                      GRADE_COLORS[r.score.grade]
                    )}>
                      {r.score.composite}
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Select Backtest Runs to Compare
        </span>
        <button
          onClick={handleCompare}
          disabled={selected.size < 2 || loading}
          className={cn(
            "rounded-md px-3 py-1 text-[10px] font-medium transition-colors",
            "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          )}
        >
          {loading ? "Comparing..." : `Compare (${selected.size})`}
        </button>
      </div>

      {runs.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          No backtest runs yet. Run a backtest first.
        </div>
      ) : (
        <div className="space-y-1">
          {runs.map((r) => (
            <button
              key={r.id}
              onClick={() => toggleRun(r.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors",
                selected.has(r.id)
                  ? "border-indigo-400 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/30"
                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  Run #{r.id}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span>{r.total_trades} trades</span>
                  <span className={r.total_return >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {r.total_return >= 0 ? "+" : ""}{r.total_return.toFixed(1)}%
                  </span>
                  <span>SR {r.sharpe_ratio.toFixed(2)}</span>
                </div>
              </div>
              <div className={cn(
                "h-4 w-4 rounded border-2 transition-colors",
                selected.has(r.id)
                  ? "border-indigo-500 bg-indigo-500"
                  : "border-slate-300 dark:border-slate-600"
              )} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
