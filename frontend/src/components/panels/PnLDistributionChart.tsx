import { useMemo } from "react";
import { cn } from "@/lib/cn";

interface Trade {
  pnl: number;
  pnl_pct: number;
  symbol: string;
  exit_reason: string;
}

interface PnLDistributionChartProps {
  trades: Trade[];
}

export function PnLDistributionChart({ trades }: PnLDistributionChartProps) {
  const { bins, maxCount, stats } = useMemo(() => {
    if (trades.length === 0) return { bins: [], maxCount: 0, stats: null };

    const pnls = trades.map((t) => t.pnl_pct);
    const min = Math.min(...pnls);
    const max = Math.max(...pnls);
    const range = max - min || 1;
    const binCount = Math.min(20, Math.max(8, Math.ceil(Math.sqrt(trades.length))));
    const binWidth = range / binCount;

    const bins: Array<{ from: number; to: number; count: number; wins: number; losses: number }> = [];
    for (let i = 0; i < binCount; i++) {
      bins.push({
        from: min + i * binWidth,
        to: min + (i + 1) * binWidth,
        count: 0,
        wins: 0,
        losses: 0,
      });
    }

    for (const pnl of pnls) {
      const idx = Math.min(Math.floor((pnl - min) / binWidth), binCount - 1);
      bins[idx].count++;
      if (pnl >= 0) bins[idx].wins++;
      else bins[idx].losses++;
    }

    const maxCount = Math.max(...bins.map((b) => b.count), 1);

    const sortedPnls = [...pnls].sort((a, b) => a - b);
    const median = sortedPnls[Math.floor(sortedPnls.length / 2)];
    const mean = pnls.reduce((s, v) => s + v, 0) / pnls.length;
    const stdDev = Math.sqrt(pnls.reduce((s, v) => s + (v - mean) ** 2, 0) / pnls.length);

    const bySymbol = new Map<string, { count: number; pnl: number }>();
    for (const t of trades) {
      const cur = bySymbol.get(t.symbol) || { count: 0, pnl: 0 };
      cur.count++;
      cur.pnl += t.pnl;
      bySymbol.set(t.symbol, cur);
    }
    const topWinner = [...bySymbol.entries()].sort((a, b) => b[1].pnl - a[1].pnl)[0];
    const topLoser = [...bySymbol.entries()].sort((a, b) => a[1].pnl - b[1].pnl)[0];

    const byReason = new Map<string, number>();
    for (const t of trades) {
      byReason.set(t.exit_reason, (byReason.get(t.exit_reason) || 0) + 1);
    }

    return {
      bins,
      maxCount,
      stats: { median, mean, stdDev, topWinner, topLoser, byReason, bySymbol },
    };
  }, [trades]);

  if (trades.length === 0) {
    return <div className="py-4 text-center text-xs text-slate-400">No trades to analyze</div>;
  }

  const REASON_COLORS: Record<string, string> = {
    signal: "bg-blue-500",
    stop_loss: "bg-red-500",
    target: "bg-emerald-500",
    trailing_stop: "bg-amber-500",
    end_of_data: "bg-slate-500",
  };

  const REASON_LABELS: Record<string, string> = {
    signal: "Signal",
    stop_loss: "Stop Loss",
    target: "Target",
    trailing_stop: "Trail Stop",
    end_of_data: "EOD",
  };

  return (
    <div className="space-y-4">
      {/* P&L Histogram */}
      <div>
        <div className="mb-2 text-[10px] font-medium text-slate-400">Return Distribution (%)</div>
        <div className="flex items-end gap-px" style={{ height: 120 }}>
          {bins.map((bin, i) => {
            const h = (bin.count / maxCount) * 100;
            const isNeg = bin.to <= 0;
            const isMixed = bin.from < 0 && bin.to > 0;
            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center justify-end group relative"
                style={{ height: "100%" }}
              >
                <div
                  className={cn(
                    "w-full rounded-t-sm transition-opacity",
                    isNeg ? "bg-red-500/80" : isMixed ? "bg-amber-500/80" : "bg-emerald-500/80"
                  )}
                  style={{ height: `${h}%`, minHeight: bin.count > 0 ? 2 : 0 }}
                />
                <div className="pointer-events-none absolute bottom-full mb-1 hidden rounded bg-slate-800 px-2 py-1 text-[9px] text-white shadow-lg group-hover:block whitespace-nowrap z-10">
                  {bin.from.toFixed(1)}% to {bin.to.toFixed(1)}%: {bin.count} trade{bin.count !== 1 ? "s" : ""}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-slate-500">
          <span>{bins[0]?.from.toFixed(1)}%</span>
          <span>0%</span>
          <span>{bins[bins.length - 1]?.to.toFixed(1)}%</span>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-slate-200 px-2 py-1.5 dark:border-slate-700">
            <div className="text-[9px] font-medium uppercase text-slate-400">Mean Return</div>
            <div className={cn("font-mono text-sm font-semibold", stats.mean >= 0 ? "text-emerald-400" : "text-red-400")}>
              {stats.mean >= 0 ? "+" : ""}{stats.mean.toFixed(2)}%
            </div>
          </div>
          <div className="rounded-md border border-slate-200 px-2 py-1.5 dark:border-slate-700">
            <div className="text-[9px] font-medium uppercase text-slate-400">Median Return</div>
            <div className={cn("font-mono text-sm font-semibold", stats.median >= 0 ? "text-emerald-400" : "text-red-400")}>
              {stats.median >= 0 ? "+" : ""}{stats.median.toFixed(2)}%
            </div>
          </div>
          <div className="rounded-md border border-slate-200 px-2 py-1.5 dark:border-slate-700">
            <div className="text-[9px] font-medium uppercase text-slate-400">Std Deviation</div>
            <div className="font-mono text-sm font-semibold text-slate-300">{stats.stdDev.toFixed(2)}%</div>
          </div>
        </div>
      )}

      {/* Exit Reason Breakdown */}
      {stats && (
        <div>
          <div className="mb-1.5 text-[10px] font-medium text-slate-400">Exit Reason Breakdown</div>
          <div className="space-y-1">
            {[...stats.byReason.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([reason, count]) => {
                const pct = (count / trades.length) * 100;
                return (
                  <div key={reason} className="flex items-center gap-2">
                    <div className="w-16 text-[10px] text-slate-400">{REASON_LABELS[reason] || reason}</div>
                    <div className="flex-1 h-3 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", REASON_COLORS[reason] || "bg-slate-500")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-14 text-right font-mono text-[10px] text-slate-400">
                      {count} ({pct.toFixed(0)}%)
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Top/Bottom Symbols */}
      {stats && stats.topWinner && stats.topLoser && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-emerald-500/20 bg-emerald-950/10 px-2 py-1.5">
            <div className="text-[9px] font-medium uppercase text-emerald-500/70">Best Symbol</div>
            <div className="font-semibold text-emerald-400">{stats.topWinner[0]}</div>
            <div className="font-mono text-[10px] text-emerald-400/80">
              +₹{stats.topWinner[1].pnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              <span className="ml-1 text-slate-500">({stats.topWinner[1].count} trades)</span>
            </div>
          </div>
          <div className="rounded-md border border-red-500/20 bg-red-950/10 px-2 py-1.5">
            <div className="text-[9px] font-medium uppercase text-red-500/70">Worst Symbol</div>
            <div className="font-semibold text-red-400">{stats.topLoser[0]}</div>
            <div className="font-mono text-[10px] text-red-400/80">
              ₹{stats.topLoser[1].pnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              <span className="ml-1 text-slate-500">({stats.topLoser[1].count} trades)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
