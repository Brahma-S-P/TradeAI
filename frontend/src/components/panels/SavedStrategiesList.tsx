import { FileCode, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

interface SavedStrategy {
  id: string;
  name: string;
  version: number;
  type: string;
  updatedAt: string;
}

function typeBadge(type: string) {
  if (type === "manual") {
    return { label: "Manual", cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400" };
  }
  if (type === "code") {
    return { label: "Code", cls: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400" };
  }
  return { label: type, cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" };
}

interface SavedStrategiesListProps {
  strategies: SavedStrategy[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function SavedStrategiesList({
  strategies,
  selectedId,
  onSelect,
}: SavedStrategiesListProps) {
  if (strategies.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
        No saved strategies yet.
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {strategies.map((s) => {
        const badge = typeBadge(s.type);
        return (
          <li key={s.id}>
            <button
              onClick={() => onSelect(s.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                selectedId === s.id
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              )}
            >
              <FileCode size={14} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{s.name}</span>
                  <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold", badge.cls)}>
                    {badge.label}
                  </span>
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  v{s.version} · {s.updatedAt}
                </div>
              </div>
              <ChevronRight size={14} className="shrink-0 text-slate-300 dark:text-slate-600" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
