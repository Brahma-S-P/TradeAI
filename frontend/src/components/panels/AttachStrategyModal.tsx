import { useState, useMemo } from "react";
import { X, Search, Paperclip, Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface StrategyAttachment {
  id: number;
  name: string;
  code: string;
  version: number;
  strategy_type: string;
}

interface AttachStrategyModalProps {
  open: boolean;
  onClose: () => void;
  strategies: StrategyAttachment[];
  attached: StrategyAttachment[];
  onAttach: (strategies: StrategyAttachment[]) => void;
}

export function AttachStrategyModal({
  open,
  onClose,
  strategies,
  attached,
  onAttach,
}: AttachStrategyModalProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(() => new Set(attached.map((a) => a.id)));

  const filtered = useMemo(() => {
    if (!search.trim()) return strategies;
    const q = search.toLowerCase();
    return strategies.filter((s) => s.name.toLowerCase().includes(q));
  }, [strategies, search]);

  function toggle(s: StrategyAttachment) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s.id)) next.delete(s.id);
      else next.add(s.id);
      return next;
    });
  }

  function handleDone() {
    const result = strategies.filter((s) => selected.has(s.id));
    onAttach(result);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Paperclip size={16} className="text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Attach Strategies</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-slate-200 px-4 py-2 dark:border-slate-700">
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
            <Search size={14} className="text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search strategies..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-slate-200"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">
              {strategies.length === 0 ? "No saved strategies found." : "No matches."}
            </p>
          )}
          {filtered.map((s) => {
            const isSelected = selected.has(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggle(s)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  isSelected
                    ? "bg-indigo-50 dark:bg-indigo-950/40"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800"
                )}
              >
                <div
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                    isSelected
                      ? "border-indigo-500 bg-indigo-500 text-white"
                      : "border-slate-300 dark:border-slate-600"
                  )}
                >
                  {isSelected && <Check size={12} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                      {s.name}
                    </span>
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      v{s.version}
                    </span>
                    <span className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium",
                      s.strategy_type === "code"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400"
                    )}>
                      {s.strategy_type}
                    </span>
                  </div>
                  {s.code && (
                    <p className="mt-0.5 truncate text-[11px] font-mono text-slate-400">
                      {s.code.slice(0, 80)}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <span className="text-xs text-slate-400">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleDone}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Attach
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
