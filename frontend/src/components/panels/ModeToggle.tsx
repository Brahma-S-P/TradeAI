import { cn } from "@/lib/cn";

interface ModeToggleProps {
  modes: string[];
  activeMode: string;
  onModeChange: (mode: string) => void;
}

export function ModeToggle({ modes, activeMode, onModeChange }: ModeToggleProps) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
      {modes.map((mode) => (
        <button
          key={mode}
          onClick={() => onModeChange(mode)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            activeMode === mode
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          )}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}
