import { useState } from "react";
import { Play, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";

interface WalkForwardWindow {
  window: number;
  is_period: string;
  oos_period: string;
  is_return: number;
  oos_return: number;
  is_sharpe: number;
  oos_sharpe: number;
  is_win_rate: number;
  oos_win_rate: number;
}

interface OverfitResult {
  is_overfit: boolean;
  degradation_pct: number;
  avg_is_return: number;
  avg_oos_return: number;
  message: string;
}

interface WalkForwardResult {
  windows: WalkForwardWindow[];
  stability_score: number;
  overfitting: OverfitResult | null;
}

interface WalkForwardPanelProps {
  code: string;
  symbols: string[];
}

export function WalkForwardPanel({ code, symbols }: WalkForwardPanelProps) {
  const [result, setResult] = useState<WalkForwardResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [windows, setWindows] = useState(4);

  async function handleRun() {
    if (!code || symbols.length === 0) return;
    setLoading(true);
    try {
      const data = await apiPost<WalkForwardResult>("/backtest/walk-forward", {
        code,
        symbols,
        n_windows: windows,
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
          Walk-Forward Test
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] text-slate-500">
            Windows
            <input
              type="number"
              value={windows}
              onChange={(e) => setWindows(Number(e.target.value))}
              className="w-10 rounded border border-slate-200 bg-white px-1 py-0.5 text-center text-[10px] dark:border-slate-700 dark:bg-slate-800"
              min={2}
              max={10}
            />
          </label>
          <button
            onClick={handleRun}
            disabled={loading || !code || symbols.length === 0}
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium",
              "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            )}
          >
            <Play size={10} />
            {loading ? "Running..." : "Run"}
          </button>
        </div>
      </div>

      {!result && !loading && (
        <div className="py-6 text-center text-xs text-slate-400">
          Run walk-forward analysis to check strategy stability across time periods.
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-6">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      )}

      {result && (
        <>
          {result.overfitting && (
            <div className={cn(
              "flex items-start gap-2 rounded-lg border p-2.5",
              result.overfitting.is_overfit
                ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
                : result.overfitting.degradation_pct > 25
                  ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
                  : "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
            )}>
              {result.overfitting.is_overfit ? (
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-500" />
              ) : result.overfitting.degradation_pct > 25 ? (
                <Info size={14} className="mt-0.5 shrink-0 text-amber-500" />
              ) : (
                <CheckCircle size={14} className="mt-0.5 shrink-0 text-emerald-500" />
              )}
              <div>
                <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                  {result.overfitting.message}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  IS avg: {result.overfitting.avg_is_return}% → OOS avg: {result.overfitting.avg_oos_return}%
                  &nbsp;(stability: {result.stability_score}/100)
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="py-1.5 pr-2 text-left text-[10px] text-slate-500">#</th>
                  <th className="px-2 py-1.5 text-center text-[10px] text-slate-500">IS Return</th>
                  <th className="px-2 py-1.5 text-center text-[10px] text-slate-500">OOS Return</th>
                  <th className="px-2 py-1.5 text-center text-[10px] text-slate-500">IS Sharpe</th>
                  <th className="px-2 py-1.5 text-center text-[10px] text-slate-500">OOS Sharpe</th>
                  <th className="px-2 py-1.5 text-center text-[10px] text-slate-500">IS WR</th>
                  <th className="px-2 py-1.5 text-center text-[10px] text-slate-500">OOS WR</th>
                </tr>
              </thead>
              <tbody>
                {result.windows.map((w) => (
                  <tr key={w.window} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-1 pr-2 text-slate-500">W{w.window}</td>
                    <td className={cn("px-2 py-1 text-center font-mono", w.is_return >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {w.is_return}%
                    </td>
                    <td className={cn("px-2 py-1 text-center font-mono", w.oos_return >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {w.oos_return}%
                    </td>
                    <td className="px-2 py-1 text-center font-mono text-slate-400">{w.is_sharpe}</td>
                    <td className="px-2 py-1 text-center font-mono text-slate-400">{w.oos_sharpe}</td>
                    <td className="px-2 py-1 text-center font-mono text-slate-400">{w.is_win_rate}%</td>
                    <td className="px-2 py-1 text-center font-mono text-slate-400">{w.oos_win_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
