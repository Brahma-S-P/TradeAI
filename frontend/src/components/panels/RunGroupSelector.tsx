import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface RunGroupOption {
  run_id: string;
  strategy_name: string;
  strategy_type: string;
  stock_count: number;
}

interface RunGroupSelectorProps {
  open: boolean;
  title: string;
  runGroups: RunGroupOption[];
  onClose: () => void;
  onSelect: (run_id: string) => void;
}

export function RunGroupSelector({ open, title, runGroups, onClose, onSelect }: RunGroupSelectorProps) {
  const [selectedRunId, setSelectedRunId] = useState("");

  useEffect(() => {
    if (open && runGroups.length > 0 && !runGroups.find((r) => r.run_id === selectedRunId)) {
      setSelectedRunId(runGroups[0].run_id);
    }
  }, [open, runGroups]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[360px] rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-4">
          <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Select stock batch to run against
          </label>
          <select
            value={selectedRunId}
            onChange={(e) => setSelectedRunId(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          >
            {runGroups.map((rg) => (
              <option key={rg.run_id} value={rg.run_id}>
                {rg.strategy_name || "Unnamed"} ({rg.stock_count} stocks)
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={() => onSelect(selectedRunId)}
            disabled={!selectedRunId}
            className={cn(
              "rounded-md px-4 py-1.5 text-xs font-semibold text-white transition-colors",
              "bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50",
            )}
          >
            Run
          </button>
        </div>
      </div>
    </div>
  );
}
