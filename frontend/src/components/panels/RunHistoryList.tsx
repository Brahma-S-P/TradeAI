import { History, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface RunHistoryItem {
  id: string;
  strategyName: string;
  dateRange: string;
  totalReturn: number;
  winRate: number;
  timestamp: string;
}

interface RunHistoryListProps {
  runs: RunHistoryItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RunHistoryList({ runs, selectedId, onSelect }: RunHistoryListProps) {
  if (runs.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">
        No past runs yet.
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {runs.map((run) => (
        <li key={run.id}>
          <button
            onClick={() => onSelect(run.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
              selectedId === run.id
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            )}
          >
            <History size={14} className="shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{run.strategyName}</div>
              <div className="text-xs text-slate-400">{run.dateRange}</div>
            </div>
            <div className="flex items-center gap-1 text-xs font-medium">
              {run.totalReturn >= 0 ? (
                <TrendingUp size={12} className="text-emerald-500" />
              ) : (
                <TrendingDown size={12} className="text-red-500" />
              )}
              <span className={run.totalReturn >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                {run.totalReturn >= 0 ? "+" : ""}{run.totalReturn.toFixed(1)}%
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
