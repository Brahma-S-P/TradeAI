import { ChevronDown, Shield } from "lucide-react";

interface RiskProfile {
  id: string;
  name: string;
  version: number;
}

interface RiskProfileSelectorProps {
  profiles: RiskProfile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RiskProfileSelector({
  profiles,
  selectedId,
  onSelect,
}: RiskProfileSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-400">
        <Shield size={14} />
        Risk Profile
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
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} (v{p.version})
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
