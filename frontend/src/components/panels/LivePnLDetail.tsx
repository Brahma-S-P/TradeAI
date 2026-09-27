import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface LivePnLDetailProps {
  realized: number;
  unrealized: number;
}

export function LivePnLDetail({ realized, unrealized }: LivePnLDetailProps) {
  const total = realized + unrealized;

  return (
    <div className="flex items-center gap-4 rounded-md border border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-950">
      <PnLItem label="Realized" value={realized} />
      <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />
      <PnLItem label="Unrealized" value={unrealized} />
      <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />
      <PnLItem label="Total" value={total} bold />
    </div>
  );
}

function PnLItem({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  const isPositive = value >= 0;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
      {isPositive ? (
        <TrendingUp size={12} className="text-emerald-500" />
      ) : (
        <TrendingDown size={12} className="text-red-500" />
      )}
      <span
        className={cn(
          "text-sm",
          bold && "font-semibold",
          isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
        )}
      >
        {isPositive ? "+" : ""}₹{Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
      </span>
    </div>
  );
}
