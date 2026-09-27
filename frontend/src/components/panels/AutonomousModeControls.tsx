import { Bot, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";

interface StrategyAutonomousState {
  strategyId: string;
  strategyName: string;
  enabled: boolean;
  backtestPassed: boolean;
  trialPassed: boolean;
}

interface AutonomousModeControlsProps {
  strategies: StrategyAutonomousState[];
  onToggle: (strategyId: string) => void;
}

export function AutonomousModeControls({ strategies, onToggle }: AutonomousModeControlsProps) {
  if (strategies.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">
        No promoted strategies available.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {strategies.map((s) => {
        const eligible = s.backtestPassed && s.trialPassed;
        return (
          <div
            key={s.strategyId}
            className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800"
          >
            <div className="flex items-center gap-2">
              <Bot size={14} className="text-slate-400" />
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {s.strategyName}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className={cn(s.backtestPassed ? "text-emerald-500" : "text-slate-400")}>
                    <ShieldCheck size={10} className="mr-0.5 inline" />
                    Backtest
                  </span>
                  <span className={cn(s.trialPassed ? "text-emerald-500" : "text-slate-400")}>
                    <ShieldCheck size={10} className="mr-0.5 inline" />
                    Trial
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => onToggle(s.strategyId)}
              disabled={!eligible}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                s.enabled
                  ? "bg-emerald-600 text-white"
                  : eligible
                    ? "border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400"
                    : "cursor-not-allowed border border-slate-200 text-slate-300 dark:border-slate-800 dark:text-slate-600"
              )}
            >
              {s.enabled ? "Auto ON" : "Auto OFF"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
