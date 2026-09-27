import { useState } from "react";
import { cn } from "@/lib/cn";

interface Trade {
  symbol: string;
  direction: string;
  entry_date: string;
  entry_price: number;
  exit_date: string;
  exit_price: number;
  pnl: number;
  pnl_pct: number;
  exit_reason: string;
  quantity: number;
}

interface TradeListTableProps {
  trades: Trade[];
  onTradeClick?: (trade: Trade) => void;
}

type SortKey = keyof Trade;

const REASON_LABELS: Record<string, { text: string; color: string }> = {
  signal: { text: "Signal", color: "text-blue-400" },
  stop_loss: { text: "Stop Loss", color: "text-red-400" },
  target: { text: "Target", color: "text-emerald-400" },
  trailing_stop: { text: "Trail Stop", color: "text-amber-400" },
  end_of_data: { text: "EOD", color: "text-slate-400" },
};

export function TradeListTable({ trades, onTradeClick }: TradeListTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("entry_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sorted = [...trades].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const cmp = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const headerClass = "px-2 py-1.5 text-left text-[10px] font-medium text-slate-400 cursor-pointer hover:text-slate-300 select-none";
  const cellClass = "px-2 py-1.5 text-xs font-mono";

  return (
    <div className="overflow-x-auto">
      <div className="mb-1 text-[10px] font-medium text-slate-400">
        Trade Log ({trades.length} trades)
      </div>
      <table className="w-full min-w-[600px] text-left">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            {([
              ["symbol", "Symbol"],
              ["direction", "Dir"],
              ["entry_date", "Entry"],
              ["exit_date", "Exit"],
              ["entry_price", "Entry ₹"],
              ["exit_price", "Exit ₹"],
              ["quantity", "Qty"],
              ["pnl", "P&L"],
              ["pnl_pct", "P&L%"],
              ["exit_reason", "Reason"],
            ] as [SortKey, string][]).map(([key, label]) => (
              <th
                key={key}
                onClick={() => handleSort(key)}
                className={cn(headerClass, sortKey === key && "text-indigo-400")}
              >
                {label} {sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, i) => {
            const reason = REASON_LABELS[t.exit_reason] || { text: t.exit_reason, color: "text-slate-400" };
            return (
              <tr
                key={i}
                onClick={() => onTradeClick?.(t)}
                className={cn(
                  "border-b border-slate-100 dark:border-slate-800 transition-colors",
                  onTradeClick && "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                )}
              >
                <td className={cn(cellClass, "font-semibold text-slate-200")}>{t.symbol}</td>
                <td className={cn(cellClass, t.direction === "long" ? "text-emerald-400" : "text-red-400")}>
                  {t.direction === "long" ? "L" : "S"}
                </td>
                <td className={cn(cellClass, "text-slate-400")}>{t.entry_date.slice(0, 10)}</td>
                <td className={cn(cellClass, "text-slate-400")}>{t.exit_date.slice(0, 10)}</td>
                <td className={cellClass}>{t.entry_price.toFixed(2)}</td>
                <td className={cellClass}>{t.exit_price.toFixed(2)}</td>
                <td className={cn(cellClass, "text-slate-400")}>{t.quantity}</td>
                <td className={cn(cellClass, t.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(2)}
                </td>
                <td className={cn(cellClass, t.pnl_pct >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {t.pnl_pct >= 0 ? "+" : ""}{t.pnl_pct.toFixed(2)}%
                </td>
                <td className={cn(cellClass, reason.color)}>{reason.text}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
