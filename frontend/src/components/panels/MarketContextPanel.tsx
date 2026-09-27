import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";

interface ContextData {
  label: string;
  trend: string;
  trend_score?: number;
  momentum: string;
  momentum_score?: number;
  volatility: string;
  relative_strength?: number | null;
  rs_label?: string;
  scores: Record<string, number | null>;
}

interface ContextResponse {
  market: ContextData;
  stock: ContextData;
}

interface MarketContextPanelProps {
  symbol: string | null;
}

const LABEL_COLORS: Record<string, string> = {
  bullish: "text-emerald-400 bg-emerald-500/10",
  bearish: "text-red-400 bg-red-500/10",
  neutral: "text-slate-400 bg-slate-500/10",
  high: "text-amber-400 bg-amber-500/10",
  low: "text-blue-400 bg-blue-500/10",
  normal: "text-slate-400 bg-slate-500/10",
  outperforming: "text-emerald-400 bg-emerald-500/10",
  underperforming: "text-red-400 bg-red-500/10",
  inline: "text-slate-400 bg-slate-500/10",
  unknown: "text-slate-500 bg-slate-500/10",
};

function Badge({ label }: { label: string }) {
  const color = LABEL_COLORS[label] || "text-slate-400 bg-slate-500/10";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", color)}>
      {label}
    </span>
  );
}

function ScoreRow({ label, value, suffix = "" }: { label: string; value: number | null | undefined; suffix?: string }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className={cn(
        "text-xs font-mono font-medium",
        value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-slate-400"
      )}>
        {value > 0 ? "+" : ""}{value}{suffix}
      </span>
    </div>
  );
}

function ContextSection({ data, showRS }: { data: ContextData; showRS?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="mb-2 text-xs font-semibold text-slate-300">{data.label}</div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-slate-500">Trend</span>
          <Badge label={data.trend} />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-slate-500">Momentum</span>
          <Badge label={data.momentum} />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-slate-500">Volatility</span>
          <Badge label={data.volatility} />
        </div>
        {showRS && data.rs_label && (
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-slate-500">vs Market</span>
            <Badge label={data.rs_label} />
          </div>
        )}
      </div>
      <div className="space-y-0.5">
        <ScoreRow label="Price vs SMA50" value={data.scores.price_vs_sma50} suffix="%" />
        <ScoreRow label="Price vs SMA200" value={data.scores.price_vs_sma200} suffix="%" />
        <ScoreRow label="RSI (14)" value={data.scores.rsi_14} />
        <ScoreRow label="5D Return" value={data.scores.return_5d} suffix="%" />
        <ScoreRow label="20D Return" value={data.scores.return_20d} suffix="%" />
        <ScoreRow label="Volatility (20D)" value={data.scores.volatility_20d} suffix="%" />
        {showRS && data.relative_strength !== null && data.relative_strength !== undefined && (
          <ScoreRow label="Relative Strength" value={data.relative_strength} suffix="%" />
        )}
      </div>
    </div>
  );
}

export function MarketContextPanel({ symbol }: MarketContextPanelProps) {
  const [data, setData] = useState<ContextResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) { setData(null); return; }
    setLoading(true);
    apiFetch<ContextResponse>(`/analyzer/${symbol}/context`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [symbol]);

  if (!symbol) {
    return <div className="py-8 text-center text-xs text-slate-400">Select a stock to view context.</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return <div className="py-8 text-center text-xs text-slate-400">Failed to load context.</div>;
  }

  return (
    <div className="space-y-3">
      <ContextSection data={data.market} />
      <ContextSection data={data.stock} showRS />
    </div>
  );
}
