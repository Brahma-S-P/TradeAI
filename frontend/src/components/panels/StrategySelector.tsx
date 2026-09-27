import { ChevronDown, FileCode } from "lucide-react";

interface Strategy {
  id: string;
  name: string;
  version: number;
}

interface StrategySelectorProps {
  strategies: Strategy[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  label?: string;
}

export function StrategySelector({
  strategies,
  selectedId,
  onSelect,
  label = "Strategy",
}: StrategySelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-400">
        <FileCode size={14} />
        {label}
      </label>
      <div className="relative">
        <select
          value={selectedId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          className="appearance-none rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          <option value="" disabled>
            Select...
          </option>
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} (v{s.version})
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
        />
      </div>
    </div>
  );
}
