interface BacktestConfig {
  startDate: string;
  endDate: string;
  capital: string;
}

interface BacktestConfigPanelProps {
  config: BacktestConfig;
  onChange: (config: BacktestConfig) => void;
}

export function BacktestConfigPanel({ config, onChange }: BacktestConfigPanelProps) {
  function update(field: keyof BacktestConfig, value: string) {
    onChange({ ...config, [field]: value });
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <Field label="Start Date">
        <input
          type="date"
          value={config.startDate}
          onChange={(e) => update("startDate", e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        />
      </Field>
      <Field label="End Date">
        <input
          type="date"
          value={config.endDate}
          onChange={(e) => update("endDate", e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        />
      </Field>
      <Field label="Initial Capital (₹)">
        <input
          type="number"
          value={config.capital}
          onChange={(e) => update("capital", e.target.value)}
          placeholder="100000"
          className="w-32 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        />
      </Field>
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
