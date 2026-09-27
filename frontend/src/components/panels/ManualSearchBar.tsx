import { Search, Plus } from "lucide-react";

interface ManualSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onAdd?: () => void;
}

export function ManualSearchBar({ value, onChange, onAdd }: ManualSearchBarProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900">
        <Search size={14} className="text-slate-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search instrument (e.g. RELIANCE, INFY)..."
          className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-300"
        />
      </div>
      <button
        onClick={onAdd}
        disabled={!value.trim()}
        className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={14} />
        Add
      </button>
    </div>
  );
}
