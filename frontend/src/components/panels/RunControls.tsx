import { Play, Square, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

interface RunControlsProps {
  status?: "idle" | "running" | "completed" | "error";
  onRun?: () => void;
  onStop?: () => void;
  onRerun?: () => void;
}

export function RunControls({
  status = "idle",
  onRun,
  onStop,
  onRerun,
}: RunControlsProps) {
  const isRunning = status === "running";

  return (
    <div className="flex items-center gap-2">
      {isRunning ? (
        <button
          onClick={onStop}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
            "bg-red-600 text-white hover:bg-red-700"
          )}
        >
          <Square size={14} />
          Stop
        </button>
      ) : (
        <button
          onClick={onRun}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
            "bg-indigo-600 text-white hover:bg-indigo-700"
          )}
        >
          <Play size={14} />
          Run
        </button>
      )}

      {(status === "completed" || status === "error") && (
        <button
          onClick={onRerun}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
            "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
            "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          )}
        >
          <RotateCcw size={14} />
          Re-run
        </button>
      )}

      {isRunning && (
        <span className="flex items-center gap-1.5 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" />
          Executing...
        </span>
      )}

      {status === "completed" && (
        <span className="text-sm text-emerald-600 dark:text-emerald-400">Completed</span>
      )}

      {status === "error" && (
        <span className="text-sm text-red-600 dark:text-red-400">Error</span>
      )}
    </div>
  );
}
