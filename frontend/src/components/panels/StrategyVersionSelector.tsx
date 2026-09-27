import { ChevronDown } from "lucide-react";

interface StrategyVersion {
  version: number;
  label: string;
}

interface StrategyVersionSelectorProps {
  versions: StrategyVersion[];
  selectedVersion: number | null;
  onSelect: (version: number) => void;
}

export function StrategyVersionSelector({
  versions,
  selectedVersion,
  onSelect,
}: StrategyVersionSelectorProps) {
  return (
    <div className="relative inline-flex">
      <select
        value={selectedVersion ?? ""}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="appearance-none rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      >
        <option value="" disabled>
          Select version
        </option>
        {versions.map((v) => (
          <option key={v.version} value={v.version}>
            v{v.version} — {v.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
      />
    </div>
  );
}
