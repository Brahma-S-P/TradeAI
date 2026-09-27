import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";

interface ScorecardProps {
  symbol: string | null;
}

interface ScorecardData {
  symbol: string;
  source: string;
  trend: Record<string, number | boolean>;
  momentum: Record<string, number | boolean>;
  volatility: Record<string, number>;
  volume: Record<string, number>;
  price_action: Record<string, number | boolean>;
  returns: Record<string, number>;
}

const CATEGORY_ORDER: (keyof Omit<ScorecardData, "symbol" | "source">)[] = [
  "returns", "momentum", "trend", "volatility", "volume", "price_action",
];

const CATEGORY_LABELS: Record<string, string> = {
  returns: "Returns",
  momentum: "Momentum",
  trend: "Trend",
  volatility: "Volatility",
  volume: "Volume",
  price_action: "Price Action",
};

const BULLISH_THRESHOLDS: Record<string, { good: [number, number]; bad: [number, number] }> = {
  rsi_7: { good: [30, 60], bad: [75, 100] },
  rsi_14: { good: [30, 60], bad: [75, 100] },
  rsi_21: { good: [30, 60], bad: [75, 100] },
  price_vs_sma20: { good: [0, 100], bad: [-100, -3] },
  price_vs_sma50: { good: [0, 100], bad: [-100, -5] },
  price_vs_sma200: { good: [0, 100], bad: [-100, -10] },
  rvol: { good: [1.2, 100], bad: [0, 0.5] },
  volume_ratio_20d: { good: [1.2, 100], bad: [0, 0.5] },
  close_position: { good: [60, 100], bad: [0, 25] },
  return_1d: { good: [0, 100], bad: [-100, -2] },
  return_5d: { good: [0, 100], bad: [-100, -3] },
  return_20d: { good: [0, 100], bad: [-100, -5] },
  return_60d: { good: [0, 100], bad: [-100, -10] },
  atr_percentage: { good: [1, 3], bad: [5, 100] },
};

function getBadge(key: string, value: number | boolean): { color: string; label: string } | null {
  if (typeof value === "boolean") {
    return value
      ? { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400", label: "Yes" }
      : { color: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500", label: "No" };
  }
  const t = BULLISH_THRESHOLDS[key];
  if (!t) return null;
  if (value >= t.good[0] && value <= t.good[1]) {
    return { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400", label: "Bullish" };
  }
  if (value >= t.bad[0] && value <= t.bad[1]) {
    return { color: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400", label: "Bearish" };
  }
  return { color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400", label: "Neutral" };
}

function formatKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b(\d+)d\b/g, "$1D")
    .replace(/\b(\d+)w\b/g, "$1W")
    .replace(/\bsma\b/gi, "SMA")
    .replace(/\bema\b/gi, "EMA")
    .replace(/\brsi\b/gi, "RSI")
    .replace(/\batr\b/gi, "ATR")
    .replace(/\bmacd\b/gi, "MACD")
    .replace(/\brvol\b/gi, "RVOL")
    .replace(/\bvwap\b/gi, "VWAP")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: number | boolean): string {
  if (typeof value === "boolean") return value ? "✓" : "✗";
  if (Math.abs(value) >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
  if (Math.abs(value) >= 1_000) return (value / 1_000).toFixed(1) + "K";
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function IndicatorScorecard({ symbol }: ScorecardProps) {
  const [data, setData] = useState<ScorecardData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) { setData(null); return; }
    setLoading(true);
    apiFetch<ScorecardData>(`/analyzer/${symbol}/scorecard`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [symbol]);

  if (!symbol) return <p className="text-xs text-slate-400">Select a stock to view its scorecard.</p>;
  if (loading) return <p className="text-xs text-slate-400">Loading scorecard...</p>;
  if (!data) return <p className="text-xs text-slate-400">Failed to load scorecard.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className="font-semibold text-slate-700 dark:text-slate-200">{data.symbol}</span>
        <span className={cn(
          "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
          data.source === "live"
            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
            : "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
        )}>
          {data.source}
        </span>
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const entries = Object.entries(data[cat] || {});
        if (entries.length === 0) return null;
        return (
          <div key={cat}>
            <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {CATEGORY_LABELS[cat]}
            </h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3 lg:grid-cols-4">
              {entries.map(([key, value]) => {
                const badge = getBadge(key, value);
                return (
                  <div key={key} className="flex items-center justify-between gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-900">
                    <span className="text-slate-500 dark:text-slate-400 truncate">{formatKey(key)}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono font-medium text-slate-700 dark:text-slate-200">
                        {formatValue(value)}
                      </span>
                      {badge && (
                        <span className={cn("rounded px-1 py-px text-[9px] font-semibold", badge.color)}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
