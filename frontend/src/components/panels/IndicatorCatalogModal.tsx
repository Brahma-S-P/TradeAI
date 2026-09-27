import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { X, Search, ChevronDown, ChevronRight, Check, SlidersHorizontal, Star, Info } from "lucide-react";
import catalog from "@/config/indicator-catalog.json";
import { cn } from "@/lib/cn";

interface IndicatorDef {
  id: string;
  label: string;
  type: string;
  unit?: string;
  description?: string;
  formula?: string;
  category?: string;
}

const FAV_KEY = "indicator-favorites";
function loadFavorites(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveFavorites(favs: Set<string>) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));
}

function IndicatorInfoPopover({ indicator, onClose }: { indicator: IndicatorDef; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        ref={ref}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{indicator.label}</h3>
            <div className="mt-0.5 flex items-center gap-2">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {indicator.id}
              </code>
              <span className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                indicator.type === "boolean" ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400" :
                indicator.type === "enum" ? "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400" :
                "bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400"
              )}>{indicator.type}{indicator.unit ? ` (${indicator.unit})` : ""}</span>
              {indicator.category && (
                <span className="text-[10px] text-slate-400">{indicator.category}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={14} />
          </button>
        </div>

        {indicator.description && (
          <div className="mb-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Description</div>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{indicator.description}</p>
          </div>
        )}

        {indicator.formula && (
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Formula</div>
            <code className="block rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {indicator.formula}
            </code>
          </div>
        )}

        {!indicator.description && !indicator.formula && (
          <p className="text-sm text-slate-400">No detailed information available for this indicator yet.</p>
        )}
      </div>
    </div>
  );
}

interface IndicatorCatalogModalProps {
  open: boolean;
  onClose: () => void;
  selected: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
}

export function IndicatorCatalogModal({ open, onClose, selected, onSelectionChange }: IndicatorCatalogModalProps) {
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [favsExpanded, setFavsExpanded] = useState(true);
  const [infoIndicator, setInfoIndicator] = useState<IndicatorDef | null>(null);

  const toggleFavorite = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavorites(next);
      return next;
    });
  }, []);

  const allIndicators = useMemo(
    () => catalog.categories.flatMap((c) => c.indicators.map((ind) => ({ ...ind, category: c.label }))),
    []
  );

  const favIndicators = useMemo(
    () => allIndicators.filter((ind) => favorites.has(ind.id)),
    [allIndicators, favorites]
  );

  const totalIndicators = useMemo(
    () => catalog.categories.reduce((sum, c) => sum + c.indicators.length, 0),
    []
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return catalog.categories;
    const q = search.toLowerCase();
    return catalog.categories
      .map((cat) => ({
        ...cat,
        indicators: cat.indicators.filter(
          (ind) =>
            ind.label.toLowerCase().includes(q) ||
            ind.id.toLowerCase().includes(q) ||
            cat.label.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.indicators.length > 0);
  }, [search]);

  function toggleCategory(id: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleIndicator(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  function selectAllInCategory(catId: string) {
    const cat = catalog.categories.find((c) => c.id === catId);
    if (!cat) return;
    const next = new Set(selected);
    const allSelected = cat.indicators.every((ind) => next.has(ind.id));
    cat.indicators.forEach((ind) => {
      if (allSelected) next.delete(ind.id);
      else next.add(ind.id);
    });
    onSelectionChange(next);
  }

  function expandAll() {
    setExpandedCategories(new Set(catalog.categories.map((c) => c.id)));
  }

  function collapseAll() {
    setExpandedCategories(new Set());
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Indicator Catalog
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {totalIndicators} indicators across {catalog.categories.length} categories
              {selected.size > 0 && (
                <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {selected.size} selected
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300">
            <X size={20} />
          </button>
        </div>

        {/* Search + Controls */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search indicators..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-indigo-400"
              autoFocus
            />
          </div>
          <button onClick={expandAll} className="rounded-md px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
            Expand All
          </button>
          <button onClick={collapseAll} className="rounded-md px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
            Collapse All
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => onSelectionChange(new Set())}
              className="rounded-md px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Category list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No indicators match your search.</div>
          ) : (
            <div className="space-y-1">
              {/* Favorites section */}
              {favIndicators.length > 0 && !search.trim() && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-900/50">
                  <button
                    onClick={() => setFavsExpanded((v) => !v)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-amber-50/50 dark:hover:bg-amber-950/30"
                  >
                    {favsExpanded ? <ChevronDown size={16} className="text-amber-500" /> : <ChevronRight size={16} className="text-amber-500" />}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Star size={14} className="fill-amber-400 text-amber-400" />
                        <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">Favorites</span>
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                          {favIndicators.length}
                        </span>
                      </div>
                    </div>
                  </button>
                  {favsExpanded && (
                    <div className="grid grid-cols-2 gap-1 px-4 pb-3 sm:grid-cols-3 lg:grid-cols-4">
                      {favIndicators.map((ind) => {
                        const isSelected = selected.has(ind.id);
                        return (
                          <button
                            key={ind.id}
                            onClick={() => toggleIndicator(ind.id)}
                            className={cn(
                              "group flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                              isSelected
                                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                                : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
                            )}
                          >
                            <div className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                              isSelected
                                ? "border-indigo-500 bg-indigo-500 text-white"
                                : "border-slate-300 dark:border-slate-600"
                            )}>
                              {isSelected && <Check size={10} strokeWidth={3} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-medium">{ind.label}</div>
                              <div className="truncate text-[10px] text-slate-400 dark:text-slate-500">{ind.category}</div>
                            </div>
                            <Info
                              size={12}
                              className="shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 hover:text-indigo-500 dark:text-slate-600"
                              onClick={(e) => { e.stopPropagation(); setInfoIndicator(ind); }}
                            />
                            <Star
                              size={12}
                              className="shrink-0 fill-amber-400 text-amber-400 opacity-60 hover:opacity-100"
                              onClick={(e) => toggleFavorite(ind.id, e)}
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {filtered.map((cat) => {
                const expanded = expandedCategories.has(cat.id) || search.trim().length > 0;
                const selectedInCat = cat.indicators.filter((ind) => selected.has(ind.id)).length;
                const allSelected = selectedInCat === cat.indicators.length;

                return (
                  <div key={cat.id} className="rounded-lg border border-slate-100 dark:border-slate-800">
                    {/* Category header */}
                    <button
                      onClick={() => toggleCategory(cat.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      {expanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{cat.label}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {cat.indicators.length}
                          </span>
                          {selectedInCat > 0 && (
                            <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                              {selectedInCat} on
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{cat.description}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); selectAllInCategory(cat.id); }}
                        className={cn(
                          "rounded px-2 py-1 text-[11px] font-medium",
                          allSelected
                            ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400"
                            : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                        )}
                      >
                        {allSelected ? "Deselect All" : "Select All"}
                      </button>
                    </button>

                    {/* Indicators grid */}
                    {expanded && (
                      <div className="grid grid-cols-2 gap-1 px-4 pb-3 sm:grid-cols-3 lg:grid-cols-4">
                        {cat.indicators.map((ind) => {
                          const isSelected = selected.has(ind.id);
                          return (
                            <button
                              key={ind.id}
                              onClick={() => toggleIndicator(ind.id)}
                              className={cn(
                                "group flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                                isSelected
                                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
                              )}
                            >
                              <div className={cn(
                                "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                isSelected
                                  ? "border-indigo-500 bg-indigo-500 text-white"
                                  : "border-slate-300 dark:border-slate-600"
                              )}>
                                {isSelected && <Check size={10} strokeWidth={3} />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-medium">{ind.label}</div>
                                <div className="flex items-center gap-1">
                                  <span className="truncate text-[10px] text-slate-400 dark:text-slate-500">{ind.id}</span>
                                  {ind.unit && (
                                    <span className="rounded bg-slate-100 px-1 text-[9px] text-slate-400 dark:bg-slate-800">{ind.unit}</span>
                                  )}
                                  <span className={cn(
                                    "rounded px-1 text-[9px]",
                                    ind.type === "boolean" ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400" :
                                    ind.type === "enum" ? "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400" :
                                    "bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400"
                                  )}>{ind.type}</span>
                                </div>
                              </div>
                              <Info
                                size={12}
                                className="shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 hover:text-indigo-500 dark:text-slate-600"
                                onClick={(e) => { e.stopPropagation(); setInfoIndicator(ind); }}
                              />
                              <Star
                                size={12}
                                className={cn(
                                  "shrink-0 transition-opacity",
                                  favorites.has(ind.id)
                                    ? "fill-amber-400 text-amber-400 opacity-80 hover:opacity-100"
                                    : "text-slate-300 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-amber-400 dark:text-slate-600"
                                )}
                                onClick={(e) => toggleFavorite(ind.id, e)}
                              />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <p className="text-xs text-slate-400">
            Selected indicators are available as screener columns and AI strategy variables
          </p>
          <button
            onClick={onClose}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Done
          </button>
        </div>
      </div>
      {infoIndicator && (
        <IndicatorInfoPopover indicator={infoIndicator} onClose={() => setInfoIndicator(null)} />
      )}
    </div>
  );
}

export function IndicatorCatalogButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
    >
      <SlidersHorizontal size={13} />
      Indicators
    </button>
  );
}
