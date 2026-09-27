import { Shield, AlertOctagon } from "lucide-react";

interface RiskControls {
  maxPositionSize: string;
  dailyLossLimit: string;
  maxTradesPerDay: string;
  killSwitchActive: boolean;
}

interface RiskControlsPanelProps {
  controls: RiskControls;
  onChange: (controls: RiskControls) => void;
}

export function RiskControlsPanel({ controls, onChange }: RiskControlsPanelProps) {
  function update<K extends keyof RiskControls>(field: K, value: RiskControls[K]) {
    onChange({ ...controls, [field]: value });
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <Shield size={12} />
        Risk Controls
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Max Position Size (₹)">
          <input
            type="number"
            value={controls.maxPositionSize}
            onChange={(e) => update("maxPositionSize", e.target.value)}
            placeholder="50000"
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          />
        </Field>
        <Field label="Daily Loss Limit (₹)">
          <input
            type="number"
            value={controls.dailyLossLimit}
            onChange={(e) => update("dailyLossLimit", e.target.value)}
            placeholder="10000"
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          />
        </Field>
        <Field label="Max Trades / Day">
          <input
            type="number"
            value={controls.maxTradesPerDay}
            onChange={(e) => update("maxTradesPerDay", e.target.value)}
            placeholder="10"
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          />
        </Field>
        <Field label="Kill Switch">
          <button
            onClick={() => update("killSwitchActive", !controls.killSwitchActive)}
            className={
              controls.killSwitchActive
                ? "flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
                : "flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
            }
          >
            <AlertOctagon size={14} />
            {controls.killSwitchActive ? "ACTIVE — Trading Halted" : "Inactive"}
          </button>
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
    </div>
  );
}
