import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";

interface SignalData {
  symbol: string;
  signal: "BUY" | "SELL" | "WAIT";
  confidence: number;
  reasons: string[];
  entry_price: number;
  stop_loss: number;
  target: number;
  risk_reward: number;
  current_price: number;
  indicators: Record<string, number | null>;
}

interface CurrentSignalBadgeProps {
  symbol: string | null;
  code: string;
}

const SIGNAL_STYLES = {
  BUY: {
    bg: "bg-emerald-500/10 border-emerald-500/30",
    text: "text-emerald-400",
    icon: TrendingUp,
  },
  SELL: {
    bg: "bg-red-500/10 border-red-500/30",
    text: "text-red-400",
    icon: TrendingDown,
  },
  WAIT: {
    bg: "bg-slate-500/10 border-slate-500/30",
    text: "text-slate-400",
    icon: Minus,
  },
};

export function CurrentSignalBadge({ symbol, code }: CurrentSignalBadgeProps) {
  const [signal, setSignal] = useState<SignalData | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchSignal() {
    if (!symbol || !code) return;
    setLoading(true);
    try {
      const data = await apiPost<SignalData>("/analyzer/signal", { code, symbol });
      setSignal(data);
    } catch {
      setSignal(null);
    }
    setLoading(false);
  }

  if (!symbol || !code) return null;

  if (!signal) {
    return (
      <button
        onClick={fetchSignal}
        disabled={loading}
        className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
        Get Signal
      </button>
    );
  }

  const style = SIGNAL_STYLES[signal.signal] || SIGNAL_STYLES.WAIT;
  const Icon = style.icon;

  return (
    <div className={cn("rounded-lg border p-2.5", style.bg)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={16} className={style.text} />
          <div>
            <span className={cn("text-sm font-bold", style.text)}>{signal.signal}</span>
            <span className="ml-1.5 text-[10px] text-slate-400">{signal.confidence}% confidence</span>
          </div>
        </div>
        <button
          onClick={fetchSignal}
          disabled={loading}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {signal.reasons.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {signal.reasons.map((r, i) => (
            <div key={i} className="text-[10px] text-slate-400">• {r}</div>
          ))}
        </div>
      )}

      {signal.signal !== "WAIT" && (
        <div className="mt-2 grid grid-cols-4 gap-2">
          <div>
            <div className="text-[9px] text-slate-500">Entry</div>
            <div className="font-mono text-[11px] text-slate-300">₹{signal.entry_price}</div>
          </div>
          <div>
            <div className="text-[9px] text-slate-500">Stop</div>
            <div className="font-mono text-[11px] text-red-400">₹{signal.stop_loss}</div>
          </div>
          <div>
            <div className="text-[9px] text-slate-500">Target</div>
            <div className="font-mono text-[11px] text-emerald-400">₹{signal.target}</div>
          </div>
          <div>
            <div className="text-[9px] text-slate-500">R:R</div>
            <div className="font-mono text-[11px] text-slate-300">{signal.risk_reward}x</div>
          </div>
        </div>
      )}
    </div>
  );
}
