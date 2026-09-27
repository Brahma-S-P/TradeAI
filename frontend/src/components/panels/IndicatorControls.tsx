import { cn } from "@/lib/cn";

const INDICATORS = [
  { key: "sma", label: "SMA" },
  { key: "ema", label: "EMA" },
  { key: "rsi", label: "RSI" },
  { key: "macd", label: "MACD" },
  { key: "bollinger", label: "Bollinger" },
  { key: "volume", label: "Volume" },
  { key: "vwap", label: "VWAP" },
  { key: "supertrend", label: "Supertrend" },
  { key: "atr", label: "ATR" },
  { key: "stochastic", label: "Stoch" },
  { key: "obv", label: "OBV" },
] as const;

interface IndicatorControlsProps {
  active: Set<string>;
  onToggle: (key: string) => void;
}

export function IndicatorControls({ active, onToggle }: IndicatorControlsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {INDICATORS.map((ind) => (
        <button
          key={ind.key}
          onClick={() => onToggle(ind.key)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            active.has(ind.key)
              ? "bg-indigo-600 text-white"
              : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
          )}
        >
          {ind.label}
        </button>
      ))}
    </div>
  );
}
