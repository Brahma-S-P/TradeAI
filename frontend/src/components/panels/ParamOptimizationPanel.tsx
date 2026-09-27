import { useState } from "react";
import { Play, Plus, Trash2, Shield, ShieldAlert } from "lucide-react";
import { apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";

interface ParamRange {
  name: string;
  values: string;
}

interface OptResult {
  params: Record<string, number>;
  metric_value: number;
  return_pct: number;
  sharpe: number;
  trades: number;
}

interface RobustnessResult {
  score: number;
  is_robust: boolean;
  best_vs_avg_spread: number;
  message: string;
}

interface OptimizeResult {
  best_params: Record<string, number>;
  best_metric: number;
  results: OptResult[];
  total_combinations: number;
  optimize_metric: string;
  robustness: RobustnessResult | null;
}

interface ParamOptimizationPanelProps {
  code: string;
  symbols: string[];
}

function parseValues(s: string): number[] {
  return s.split(",").map((v) => Number(v.trim())).filter((v) => !isNaN(v));
}

export function ParamOptimizationPanel({ code, symbols }: ParamOptimizationPanelProps) {
  const [params, setParams] = useState<ParamRange[]>([
    { name: "rsi_period", values: "7, 14, 21" },
  ]);
  const [metric, setMetric] = useState("sharpe_ratio");
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [loading, setLoading] = useState(false);

  function addParam() {
    setParams([...params, { name: "", values: "" }]);
  }

  function updateParam(i: number, patch: Partial<ParamRange>) {
    setParams(params.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function removeParam(i: number) {
    setParams(params.filter((_, idx) => idx !== i));
  }

  async function handleRun() {
    if (!code || symbols.length === 0 || params.length === 0) return;
    const paramRanges: Record<string, number[]> = {};
    for (const p of params) {
      if (!p.name) continue;
      const vals = parseValues(p.values);
      if (vals.length === 0) continue;
      paramRanges[p.name] = vals;
    }
    if (Object.keys(paramRanges).length === 0) return;

    setLoading(true);
    try {
      const data = await apiPost<OptimizeResult>("/backtest/optimize", {
        code,
        symbols,
        param_ranges: paramRanges,
        optimize_metric: metric,
      });
      setResult(data);
    } catch {
      setResult(null);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Parameter Optimization
        </span>
        <button
          onClick={handleRun}
          disabled={loading || !code || symbols.length === 0}
          className={cn(
            "flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium",
            "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          )}
        >
          <Play size={10} />
          {loading ? "Optimizing..." : "Optimize"}
        </button>
      </div>

      <div className="space-y-1.5">
        {params.map((p, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              type="text"
              value={p.name}
              onChange={(e) => updateParam(i, { name: e.target.value })}
              placeholder="param_name"
              className="w-28 rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <input
              type="text"
              value={p.values}
              onChange={(e) => updateParam(i, { values: e.target.value })}
              placeholder="7, 14, 21"
              className="flex-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <button onClick={() => removeParam(i)} className="rounded p-0.5 text-slate-400 hover:text-red-500">
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <button
            onClick={addParam}
            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950"
          >
            <Plus size={10} /> Add Parameter
          </button>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="sharpe_ratio">Optimize: Sharpe</option>
            <option value="total_return_pct">Optimize: Return</option>
            <option value="profit_factor">Optimize: Profit Factor</option>
            <option value="win_rate">Optimize: Win Rate</option>
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-6">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      )}

      {result && (
        <>
          {result.robustness && (
            <div className={cn(
              "flex items-start gap-2 rounded-lg border p-2.5",
              result.robustness.is_robust
                ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
            )}>
              {result.robustness.is_robust ? (
                <Shield size={14} className="mt-0.5 shrink-0 text-emerald-500" />
              ) : (
                <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-500" />
              )}
              <div>
                <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                  Robustness: {result.robustness.score}/100
                </div>
                <div className="text-[10px] text-slate-500">{result.robustness.message}</div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="text-[10px] font-semibold text-slate-500">Best Parameters</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {Object.entries(result.best_params).map(([k, v]) => (
                <span key={k} className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-500">
                  {k}={v}
                </span>
              ))}
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                {result.optimize_metric}: {result.best_metric}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="py-1.5 pr-2 text-left text-[10px] text-slate-500">#</th>
                  <th className="px-2 py-1.5 text-left text-[10px] text-slate-500">Params</th>
                  <th className="px-2 py-1.5 text-center text-[10px] text-slate-500">Metric</th>
                  <th className="px-2 py-1.5 text-center text-[10px] text-slate-500">Return</th>
                  <th className="px-2 py-1.5 text-center text-[10px] text-slate-500">Sharpe</th>
                  <th className="px-2 py-1.5 text-center text-[10px] text-slate-500">Trades</th>
                </tr>
              </thead>
              <tbody>
                {result.results.slice(0, 20).map((r, i) => (
                  <tr key={i} className={cn(
                    "border-b border-slate-100 dark:border-slate-800",
                    i === 0 && "bg-emerald-50/50 dark:bg-emerald-950/20"
                  )}>
                    <td className="py-1 pr-2 text-slate-500">{i + 1}</td>
                    <td className="px-2 py-1 text-slate-400">
                      {Object.entries(r.params).map(([k, v]) => `${k}=${v}`).join(", ")}
                    </td>
                    <td className="px-2 py-1 text-center font-mono text-slate-300">{r.metric_value}</td>
                    <td className={cn("px-2 py-1 text-center font-mono", r.return_pct >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {r.return_pct}%
                    </td>
                    <td className="px-2 py-1 text-center font-mono text-slate-400">{r.sharpe}</td>
                    <td className="px-2 py-1 text-center font-mono text-slate-400">{r.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.results.length > 20 && (
              <div className="py-1 text-center text-[10px] text-slate-400">
                Showing top 20 of {result.total_combinations} combinations
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
