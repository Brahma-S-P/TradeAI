import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface RunGroupOption {
  run_id: string;
  strategy_name: string;
  strategy_type: string;
  stock_count: number;
}

interface BacktestConfig {
  run_id: string;
  initial_capital: number;
  max_positions: number;
  stop_loss_pct: number;
  target_pct: number;
}

interface BacktestConfigModalProps {
  open: boolean;
  runGroups: RunGroupOption[];
  onClose: () => void;
  onRun: (config: BacktestConfig) => void;
}

export type { BacktestConfig, RunGroupOption };

export function BacktestConfigModal({ open, runGroups, onClose, onRun }: BacktestConfigModalProps) {
  const [selectedRunId, setSelectedRunId] = useState("");
  const [capital, setCapital] = useState(100000);
  const [maxPositions, setMaxPositions] = useState(10);
  const [stopLoss, setStopLoss] = useState(5);
  const [target, setTarget] = useState(10);

  useEffect(() => {
    if (open && runGroups.length > 0 && !runGroups.find((r) => r.run_id === selectedRunId)) {
      setSelectedRunId(runGroups[0].run_id);
    }
  }, [open, runGroups]);

  if (!open) return null;

  const selected = runGroups.find((r) => r.run_id === selectedRunId);
  const perStock = selected ? Math.round(capital / Math.min(maxPositions, selected.stock_count)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[420px] rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Backtest Configuration</h3>
          <button onClick={onClose} className="rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {/* Batch selector */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Stock Batch
            </label>
            <select
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            >
              {runGroups.map((rg) => (
                <option key={rg.run_id} value={rg.run_id}>
                  {rg.strategy_name || "Unnamed"} ({rg.stock_count} stocks) — {rg.strategy_type}
                </option>
              ))}
            </select>
          </div>

          {/* Capital */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Starting Capital (₹)
            </label>
            <input
              type="number"
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
              min={1000}
              step={10000}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>

          {/* Max positions + Stop loss + Target in a row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                Max Positions
              </label>
              <input
                type="number"
                value={maxPositions}
                onChange={(e) => setMaxPositions(Number(e.target.value))}
                min={1}
                max={50}
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                Stop Loss %
              </label>
              <input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(Number(e.target.value))}
                min={0.5}
                max={50}
                step={0.5}
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                Target %
              </label>
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                min={0.5}
                max={100}
                step={0.5}
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
          </div>

          {/* Capital split info */}
          {selected && (
            <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900/50">
              <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Capital Allocation</div>
              <div className="mt-0.5 text-xs text-slate-700 dark:text-slate-200">
                ₹{capital.toLocaleString()} split across up to {Math.min(maxPositions, selected.stock_count)} positions
                = <span className="font-semibold text-indigo-600 dark:text-indigo-400">₹{perStock.toLocaleString()}</span> per stock
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onRun({
                run_id: selectedRunId,
                initial_capital: capital,
                max_positions: maxPositions,
                stop_loss_pct: stopLoss,
                target_pct: target,
              })
            }
            disabled={!selectedRunId}
            className={cn(
              "rounded-md px-4 py-1.5 text-xs font-semibold text-white transition-colors",
              "bg-amber-600 hover:bg-amber-700 disabled:opacity-50",
            )}
          >
            Run Backtest
          </button>
        </div>
      </div>
    </div>
  );
}
