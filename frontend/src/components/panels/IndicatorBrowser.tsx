import { useMemo } from "react";
import { Plus, X, Play, Save, Loader2, Trash2, Check } from "lucide-react";
import catalog from "@/config/indicator-catalog.json";
import { cn } from "@/lib/cn";

export interface IndicatorFilter {
  id: string;
  operator: string;
  value: string;
  value2: string;
}

interface IndicatorBrowserProps {
  filters: IndicatorFilter[];
  onFiltersChange: (filters: IndicatorFilter[]) => void;
  onOpenCatalog: () => void;
  onRun?: () => void;
  onSave?: () => void;
  onUpdate?: () => void;
  canUpdate?: boolean;
  running?: boolean;
}

const OPERATORS_NUMBER = [">", ">=", "<", "<=", "=", "between"];
const OPERATORS_BOOLEAN = ["= true", "= false"];

function findIndicator(id: string) {
  for (const cat of catalog.categories) {
    const ind = cat.indicators.find((i) => i.id === id);
    if (ind) return { ...ind, category: cat.label };
  }
  return null;
}

export function IndicatorBrowser({ filters, onFiltersChange, onOpenCatalog, onRun, onSave, onUpdate, canUpdate, running }: IndicatorBrowserProps) {
  function updateFilter(idx: number, patch: Partial<IndicatorFilter>) {
    const next = filters.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    onFiltersChange(next);
  }

  function removeFilter(idx: number) {
    onFiltersChange(filters.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Active Filters
          {filters.length > 0 && (
            <span className="ml-1.5 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[9px] font-bold normal-case tracking-normal text-white">
              {filters.length}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {filters.length > 0 && (
            <button
              onClick={() => onFiltersChange([])}
              className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-300 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-red-950 dark:hover:text-red-400"
              title="Clear all filters"
            >
              <Trash2 size={11} />
              Clear
            </button>
          )}
          {filters.length > 0 && canUpdate && onUpdate && (
            <button
              onClick={onUpdate}
              className="flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 dark:hover:bg-emerald-950"
              title="Save changes to the loaded strategy"
            >
              <Check size={11} />
              Update
            </button>
          )}
          {filters.length > 0 && onSave && (
            <button
              onClick={onSave}
              className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
              title="Save as new strategy"
            >
              <Save size={11} />
              Save As
            </button>
          )}
          {filters.length > 0 && onRun && (
            <button
              onClick={onRun}
              disabled={running}
              className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              title="Run filters"
            >
              {running ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
              Run
            </button>
          )}
          <button
            onClick={onOpenCatalog}
            className="flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-indigo-700"
          >
            <Plus size={11} />
            Add
          </button>
        </div>
      </div>

      {/* Filter list */}
      <div className="flex-1 space-y-1 overflow-y-auto">
        {filters.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-[11px] text-slate-400">No indicators added yet.</p>
            <button
              onClick={onOpenCatalog}
              className="mt-2 text-[11px] font-medium text-indigo-500 hover:text-indigo-600"
            >
              + Add Indicator
            </button>
          </div>
        ) : (
          filters.map((f, idx) => {
            const ind = findIndicator(f.id);
            if (!ind) return null;
            const isBool = ind.type === "boolean";
            const isEnum = ind.type === "enum";
            const operators = isBool ? OPERATORS_BOOLEAN : OPERATORS_NUMBER;

            return (
              <div
                key={`${f.id}-${idx}`}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950"
              >
                {/* Label + remove */}
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
                      {ind.label}
                    </span>
                    <span className="ml-1.5 text-[9px] text-slate-400">{ind.category}</span>
                  </div>
                  <button
                    onClick={() => removeFilter(idx)}
                    className="shrink-0 rounded p-0.5 text-slate-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                  >
                    <X size={11} />
                  </button>
                </div>

                {/* Operator + value */}
                <div className="mt-1 flex items-center gap-1">
                  {isBool ? (
                    <select
                      value={f.operator || "= true"}
                      onChange={(e) => updateFilter(idx, { operator: e.target.value, value: "" })}
                      className="w-full rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      {operators.map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                  ) : isEnum ? (
                    <select
                      value={f.value}
                      onChange={(e) => updateFilter(idx, { operator: "=", value: e.target.value })}
                      className="w-full rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      <option value="">Select...</option>
                      {(ind as any).values?.map((v: string) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <select
                        value={f.operator || ">"}
                        onChange={(e) => updateFilter(idx, { operator: e.target.value })}
                        className="w-14 shrink-0 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      >
                        {operators.map((op) => (
                          <option key={op} value={op}>{op}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={f.value}
                        onChange={(e) => updateFilter(idx, { value: e.target.value })}
                        placeholder={ind.unit || "value"}
                        className="w-full min-w-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      />
                      {f.operator === "between" && (
                        <>
                          <span className="text-[10px] text-slate-400">–</span>
                          <input
                            type="number"
                            value={f.value2}
                            onChange={(e) => updateFilter(idx, { value2: e.target.value })}
                            placeholder="max"
                            className="w-full min-w-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                          />
                        </>
                      )}
                      {ind.unit && (
                        <span className="shrink-0 text-[9px] text-slate-400">{ind.unit}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
