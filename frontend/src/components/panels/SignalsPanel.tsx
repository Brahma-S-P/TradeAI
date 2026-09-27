import { cn } from "@/lib/cn";

export interface SignalResult {
  symbol: string;
  signal: "buy" | "sell" | "hold";
  reason: string;
  entry_price: number;
  target: number;
  stop_loss: number;
}

interface SignalsPanelProps {
  signals: SignalResult[];
  onSelectStock?: (symbol: string) => void;
}

const SIGNAL_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  buy: {
    bg: "bg-emerald-100 dark:bg-emerald-950/50",
    text: "text-emerald-700 dark:text-emerald-400",
    label: "BUY",
  },
  sell: {
    bg: "bg-red-100 dark:bg-red-950/50",
    text: "text-red-700 dark:text-red-400",
    label: "SELL",
  },
  hold: {
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-500 dark:text-slate-400",
    label: "HOLD",
  },
};

function formatPrice(v: number): string {
  if (!v) return "—";
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SignalsPanel({ signals, onSelectStock }: SignalsPanelProps) {
  if (signals.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        No signals yet. Run a buy/sell strategy to see results.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800">
            <th className="px-2 py-1.5 text-left font-medium text-slate-500 dark:text-slate-400">Symbol</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-500 dark:text-slate-400">Signal</th>
            <th className="px-2 py-1.5 text-left font-medium text-slate-500 dark:text-slate-400">Reason</th>
            <th className="px-2 py-1.5 text-right font-medium text-slate-500 dark:text-slate-400">Entry</th>
            <th className="px-2 py-1.5 text-right font-medium text-slate-500 dark:text-slate-400">Target</th>
            <th className="px-2 py-1.5 text-right font-medium text-slate-500 dark:text-slate-400">Stop Loss</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => {
            const style = SIGNAL_STYLES[s.signal] || SIGNAL_STYLES.hold;
            return (
              <tr
                key={s.symbol}
                onClick={() => onSelectStock?.(s.symbol)}
                className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900"
              >
                <td className="px-2 py-1.5 font-medium text-slate-700 dark:text-slate-200">
                  {s.symbol}
                </td>
                <td className="px-2 py-1.5">
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", style.bg, style.text)}>
                    {style.label}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400 max-w-48 truncate">
                  {s.reason}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-700 dark:text-slate-200">
                  {formatPrice(s.entry_price)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
                  {formatPrice(s.target)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-red-600 dark:text-red-400">
                  {formatPrice(s.stop_loss)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
