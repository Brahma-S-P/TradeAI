import { useEffect, useState } from "react";
import { Columns2 } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";

interface ComparisonViewProps {
  stocks: string[];
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

type Category = "returns" | "momentum" | "trend" | "volatility" | "volume" | "price_action";

const COMPARE_KEYS: { cat: Category; key: string; label: string; unit?: string; higherBetter?: boolean }[] = [
  { cat: "returns", key: "return_1d", label: "1D Return", unit: "%", higherBetter: true },
  { cat: "returns", key: "return_5d", label: "5D Return", unit: "%", higherBetter: true },
  { cat: "returns", key: "return_20d", label: "20D Return", unit: "%", higherBetter: true },
  { cat: "returns", key: "return_60d", label: "60D Return", unit: "%", higherBetter: true },
  { cat: "momentum", key: "rsi_14", label: "RSI (14)" },
  { cat: "momentum", key: "macd", label: "MACD" },
  { cat: "trend", key: "price_vs_sma20", label: "vs SMA20", unit: "%" },
  { cat: "trend", key: "price_vs_sma50", label: "vs SMA50", unit: "%" },
  { cat: "trend", key: "consecutive_up_days", label: "Up Days", higherBetter: true },
  { cat: "volatility", key: "atr_percentage", label: "ATR %", unit: "%" },
  { cat: "volatility", key: "historical_volatility_20d", label: "HV 20D", unit: "%" },
  { cat: "volume", key: "rvol", label: "RVOL", higherBetter: true },
  { cat: "volume", key: "volume_ratio_20d", label: "Vol Ratio 20D", higherBetter: true },
  { cat: "price_action", key: "close_position", label: "Close Position", unit: "%" },
  { cat: "price_action", key: "distance_from_52w_high", label: "from 52W High", unit: "%" },
];

function getValue(data: ScorecardData, cat: Category, key: string): number | boolean | null {
  const section = data[cat];
  if (!section || !(key in section)) return null;
  return section[key] as number | boolean;
}

function cellColor(values: (number | null)[], idx: number, higherBetter?: boolean): string {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return "";
  const v = values[idx];
  if (v === null) return "";
  const best = higherBetter ? Math.max(...nums) : Math.min(...nums);
  const worst = higherBetter ? Math.min(...nums) : Math.max(...nums);
  if (v === best) return "bg-emerald-50 dark:bg-emerald-950/30";
  if (v === worst) return "bg-red-50 dark:bg-red-950/30";
  return "";
}

export function ComparisonView({ stocks }: ComparisonViewProps) {
  const [data, setData] = useState<Record<string, ScorecardData>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (stocks.length < 2) { setData({}); return; }
    setLoading(true);
    apiPost<Record<string, ScorecardData>>("/analyzer/compare", { symbols: stocks })
      .then(setData)
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, [stocks]);

  if (stocks.length < 2) {
    return <EmptyState text="Select 2 or more stocks to compare." />;
  }

  if (loading) return <p className="text-xs text-slate-400">Loading comparison...</p>;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Columns2 size={14} />
        Comparing {stocks.length} stocks
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="px-2 py-1.5 text-left font-medium text-slate-500 dark:text-slate-400">Indicator</th>
              {stocks.map((sym) => (
                <th key={sym} className="px-2 py-1.5 text-right font-semibold text-slate-700 dark:text-slate-200">
                  {sym}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_KEYS.map(({ cat, key, label, unit, higherBetter }) => {
              const values = stocks.map((sym) => {
                const d = data[sym];
                if (!d) return null;
                const v = getValue(d, cat, key);
                return typeof v === "number" ? v : null;
              });

              return (
                <tr key={key} className="border-b border-slate-100 dark:border-slate-900">
                  <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{label}</td>
                  {stocks.map((sym, i) => {
                    const d = data[sym];
                    if (!d) return <td key={sym} className="px-2 py-1 text-right text-slate-400">—</td>;
                    const raw = getValue(d, cat, key);
                    const display = raw === null ? "—"
                      : typeof raw === "boolean" ? (raw ? "✓" : "✗")
                      : `${raw.toFixed(2)}${unit || ""}`;
                    return (
                      <td
                        key={sym}
                        className={cn(
                          "px-2 py-1 text-right font-mono text-slate-700 dark:text-slate-200",
                          typeof raw === "number" && cellColor(values, i, higherBetter)
                        )}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
