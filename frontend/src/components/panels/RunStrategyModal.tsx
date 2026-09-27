import { useState, useMemo, useEffect, useRef } from "react";
import {
  X, Search, CheckSquare, Square, BarChart3, TrendingUp,
  Clock, Layers, ChevronDown, Settings2, DollarSign, Monitor, LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/cn";

type StockMode = "charted-single" | "charted-multi" | "list" | "search" | "custom";
type DatePreset = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "custom";
type Interval = "minute" | "3minute" | "5minute" | "10minute" | "15minute" | "30minute" | "60minute" | "day";

const ALL_INTERVALS: Interval[] = [
  "minute", "3minute", "5minute", "10minute", "15minute", "30minute", "60minute", "day",
];

const INTERVAL_LABELS: Record<Interval, string> = {
  minute: "1 min",
  "3minute": "3 min",
  "5minute": "5 min",
  "10minute": "10 min",
  "15minute": "15 min",
  "30minute": "30 min",
  "60minute": "1 hour",
  day: "Daily",
};

const INTERVAL_CANDLES_PER_DAY: Record<Interval, number> = {
  minute: 375,
  "3minute": 125,
  "5minute": 75,
  "10minute": 38,
  "15minute": 25,
  "30minute": 13,
  "60minute": 6,
  day: 1,
};

const DATE_PRESET_DAYS: Record<DatePreset, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  custom: 0,
};

function dateFromPreset(preset: DatePreset): string {
  const d = new Date();
  switch (preset) {
    case "1D": break;
    case "1W": d.setDate(d.getDate() - 7); break;
    case "1M": d.setMonth(d.getMonth() - 1); break;
    case "3M": d.setMonth(d.getMonth() - 3); break;
    case "6M": d.setMonth(d.getMonth() - 6); break;
    case "1Y": d.setFullYear(d.getFullYear() - 1); break;
    default: return "";
  }
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000));
}

export interface RunConfig {
  symbols: string[];
  dateFrom: string;
  dateTo: string;
  interval: Interval;
  initialCapital: number;
  maxTradesPerDay: number;
  positionSizePct: number;
  mode: "code" | "visual";
}

interface StockEntry {
  symbol: string;
  name: string;
}

interface RunStrategyModalProps {
  open: boolean;
  onClose: () => void;
  onRun: (config: RunConfig) => void;
  singleChartSymbol: string | null;
  chartedSymbols: StockEntry[];
  listStocks: StockEntry[];
  allStocks: StockEntry[];
  builderMode: "code" | "visual";
  hasCode: boolean;
}

export function RunStrategyModal({
  open,
  onClose,
  onRun,
  singleChartSymbol,
  chartedSymbols,
  listStocks,
  allStocks,
  builderMode,
  hasCode,
}: RunStrategyModalProps) {
  const [stockMode, setStockMode] = useState<StockMode>("list");
  const [listSelectMode, setListSelectMode] = useState<"all" | "individual">("all");
  const [selectedFromList, setSelectedFromList] = useState<Set<string>>(new Set());
  const [listSearch, setListSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFromSearch, setSelectedFromSearch] = useState<Set<string>>(new Set());
  const [customSymbols, setCustomSymbols] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("3M");
  const [dateFrom, setDateFrom] = useState(dateFromPreset("3M"));
  const [dateTo, setDateTo] = useState(todayStr());
  const [interval, setInterval_] = useState<Interval>("day");
  const [initialCapital, setInitialCapital] = useState(100000);
  const [maxTradesPerDay, setMaxTradesPerDay] = useState(5);
  const [positionSizePct, setPositionSizePct] = useState(10);
  const [showParams, setShowParams] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const defaultMode = chartedSymbols.length > 0 ? "charted-multi" : listStocks.length > 0 ? "list" : "search";
    setStockMode(defaultMode);
    setListSelectMode("all");
    setSelectedFromList(new Set());
    setSelectedFromSearch(new Set());
    setListSearch("");
    setSearchQuery("");
    setCustomSymbols("");
  }, [open, chartedSymbols.length, listStocks.length]);

  function handleDatePresetChange(preset: DatePreset) {
    setDatePreset(preset);
    if (preset !== "custom") {
      setDateFrom(dateFromPreset(preset));
      setDateTo(todayStr());
    }
  }

  const resolvedSymbols = useMemo(() => {
    switch (stockMode) {
      case "charted-single":
        return singleChartSymbol ? [singleChartSymbol] : [];
      case "charted-multi":
        return chartedSymbols.map((c) => c.symbol);
      case "list":
        return listSelectMode === "all"
          ? listStocks.map((s) => s.symbol)
          : Array.from(selectedFromList);
      case "search":
        return Array.from(selectedFromSearch);
      case "custom":
        return customSymbols
          .split(/[,\s]+/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
    }
  }, [stockMode, singleChartSymbol, chartedSymbols, listSelectMode, listStocks, selectedFromList, selectedFromSearch, customSymbols]);

  const days = datePreset === "custom" ? daysBetween(dateFrom, dateTo) : DATE_PRESET_DAYS[datePreset];
  const tradingDays = Math.round(days * 0.7);
  const candlesPerStock = tradingDays * INTERVAL_CANDLES_PER_DAY[interval];
  const totalCandles = candlesPerStock * resolvedSymbols.length;

  // Filtered list stocks (for "list" mode)
  const filteredListStocks = useMemo(() => {
    if (!listSearch.trim()) return listStocks;
    const q = listSearch.toLowerCase();
    return listStocks.filter(
      (s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
  }, [listStocks, listSearch]);

  // Filtered universe stocks (for "search" mode)
  const filteredAllStocks = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allStocks.filter(
      (s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [allStocks, searchQuery]);

  function toggleListStock(symbol: string) {
    setSelectedFromList((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  function toggleSearchStock(symbol: string) {
    setSelectedFromSearch((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  function handleSelectAll() {
    const allSelected = filteredListStocks.every((s) => selectedFromList.has(s.symbol));
    if (allSelected) {
      setSelectedFromList((prev) => {
        const next = new Set(prev);
        for (const s of filteredListStocks) next.delete(s.symbol);
        return next;
      });
    } else {
      setSelectedFromList((prev) => {
        const next = new Set(prev);
        for (const s of filteredListStocks) next.add(s.symbol);
        return next;
      });
    }
  }

  function handleRun() {
    if (resolvedSymbols.length === 0) return;
    onRun({
      symbols: resolvedSymbols,
      dateFrom,
      dateTo,
      interval,
      initialCapital,
      maxTradesPerDay,
      positionSizePct,
      mode: builderMode,
    });
    onClose();
  }

  if (!open) return null;

  const canRun = resolvedSymbols.length > 0 && (builderMode === "visual" || hasCode);
  const allListSelected = filteredListStocks.length > 0 && filteredListStocks.every((s) => selectedFromList.has(s.symbol));

  function ModeBtn({ mode, label, count }: { mode: StockMode; label: string; count?: number }) {
    return (
      <button
        onClick={() => setStockMode(mode)}
        className={cn(
          "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
          stockMode === mode
            ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
            : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
        )}
      >
        {label}{count !== undefined ? ` (${count})` : ""}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Run Strategy</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Section 1: Stock Selection */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Layers size={12} />
              Stocks
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {singleChartSymbol && (
                <ModeBtn mode="charted-single" label={`Chart: ${singleChartSymbol}`} />
              )}
              {chartedSymbols.length > 0 && (
                <ModeBtn mode="charted-multi" label="Multi Charts" count={chartedSymbols.length} />
              )}
              {listStocks.length > 0 && (
                <ModeBtn mode="list" label="Analyzer List" count={listStocks.length} />
              )}
              <ModeBtn mode="search" label="Search All" count={allStocks.length} />
              <ModeBtn mode="custom" label="Custom" />
            </div>

            {/* Charted Single */}
            {stockMode === "charted-single" && singleChartSymbol && (
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
                <Monitor size={13} className="text-indigo-500" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{singleChartSymbol}</span>
                <span className="text-[10px] text-slate-400">Current chart symbol</span>
              </div>
            )}

            {/* Charted Multi */}
            {stockMode === "charted-multi" && (
              <div className="flex flex-wrap gap-1">
                {chartedSymbols.length === 0 ? (
                  <span className="text-xs text-slate-400">No charts loaded in multi-chart grid</span>
                ) : (
                  chartedSymbols.map((c) => (
                    <span key={c.symbol} className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      {c.symbol}
                    </span>
                  ))
                )}
              </div>
            )}

            {/* Analyzer List — all or individual */}
            {stockMode === "list" && (
              <div>
                {/* All / Individual toggle */}
                <div className="mb-2 flex rounded-md border border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setListSelectMode("all")}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-l-md px-3 py-1.5 text-xs font-medium transition-colors",
                      listSelectMode === "all"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    <CheckSquare size={12} />
                    All {listStocks.length} stocks
                  </button>
                  <button
                    onClick={() => setListSelectMode("individual")}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-r-md px-3 py-1.5 text-xs font-medium transition-colors",
                      listSelectMode === "individual"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    <Square size={12} />
                    Pick individually
                  </button>
                </div>

                {listSelectMode === "all" ? (
                  <div className="rounded-md border border-dashed border-indigo-300 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-400">
                    All {listStocks.length} stocks from analyzer will be tested
                  </div>
                ) : (
                  <>
                    <div className="mb-1.5 flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={listSearch}
                          onChange={(e) => setListSearch(e.target.value)}
                          placeholder="Filter stocks..."
                          className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        />
                      </div>
                      <button
                        onClick={handleSelectAll}
                        className={cn(
                          "flex items-center gap-1 rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors",
                          allListSelected
                            ? "border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400"
                            : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                        )}
                      >
                        {allListSelected ? <CheckSquare size={11} /> : <Square size={11} />}
                        {allListSelected ? "Deselect" : "Select All"}
                      </button>
                    </div>
                    <div className="max-h-36 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 [scrollbar-width:thin]">
                      {filteredListStocks.map((s) => (
                        <button
                          key={s.symbol}
                          onClick={() => toggleListStock(s.symbol)}
                          className={cn(
                            "flex w-full items-center gap-2 border-b border-slate-100 px-2 py-1 text-left text-xs last:border-0 dark:border-slate-800",
                            selectedFromList.has(s.symbol)
                              ? "bg-indigo-50 dark:bg-indigo-950/30"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          )}
                        >
                          {selectedFromList.has(s.symbol) ? (
                            <CheckSquare size={12} className="shrink-0 text-indigo-500" />
                          ) : (
                            <Square size={12} className="shrink-0 text-slate-300 dark:text-slate-600" />
                          )}
                          <span className="font-medium text-slate-700 dark:text-slate-200">{s.symbol}</span>
                          <span className="truncate text-slate-400">{s.name}</span>
                        </button>
                      ))}
                    </div>
                    {selectedFromList.size > 0 && (
                      <div className="mt-1 text-[10px] text-indigo-500">{selectedFromList.size} of {listStocks.length} selected</div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Search All — searchable universe */}
            {stockMode === "search" && (
              <div>
                <div className="relative mb-1.5">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Type to search all stocks..."
                    autoFocus
                    className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  />
                </div>
                {selectedFromSearch.size > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1">
                    {Array.from(selectedFromSearch).map((sym) => (
                      <button
                        key={sym}
                        onClick={() => toggleSearchStock(sym)}
                        className="flex items-center gap-0.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900"
                      >
                        {sym}
                        <X size={8} />
                      </button>
                    ))}
                  </div>
                )}
                {searchQuery.trim() ? (
                  <div className="max-h-36 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 [scrollbar-width:thin]">
                    {filteredAllStocks.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-400">No matches</div>
                    ) : (
                      filteredAllStocks.map((s) => (
                        <button
                          key={s.symbol}
                          onClick={() => toggleSearchStock(s.symbol)}
                          className={cn(
                            "flex w-full items-center gap-2 border-b border-slate-100 px-2 py-1 text-left text-xs last:border-0 dark:border-slate-800",
                            selectedFromSearch.has(s.symbol)
                              ? "bg-indigo-50 dark:bg-indigo-950/30"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          )}
                        >
                          {selectedFromSearch.has(s.symbol) ? (
                            <CheckSquare size={12} className="shrink-0 text-indigo-500" />
                          ) : (
                            <Square size={12} className="shrink-0 text-slate-300 dark:text-slate-600" />
                          )}
                          <span className="font-medium text-slate-700 dark:text-slate-200">{s.symbol}</span>
                          <span className="truncate text-slate-400">{s.name}</span>
                        </button>
                      ))
                    )}
                    {filteredAllStocks.length === 50 && (
                      <div className="px-3 py-1 text-[10px] text-slate-400">Showing first 50 — refine your search</div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-center text-xs text-slate-400 dark:border-slate-700">
                    Search {allStocks.length} stocks across all indices
                  </div>
                )}
              </div>
            )}

            {/* Custom */}
            {stockMode === "custom" && (
              <textarea
                value={customSymbols}
                onChange={(e) => setCustomSymbols(e.target.value.toUpperCase())}
                placeholder={"Enter symbols separated by commas or spaces\ne.g. RELIANCE, TCS, INFY, HDFCBANK"}
                rows={3}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              />
            )}
          </div>

          {/* Section 2: Date Range */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Clock size={12} />
              Date Range
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(["1D", "1W", "1M", "3M", "6M", "1Y"] as DatePreset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handleDatePresetChange(p)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                    datePreset === p
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                      : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                  )}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => handleDatePresetChange("custom")}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  datePreset === "custom"
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                )}
              >
                Custom
              </button>
            </div>
            {datePreset === "1D" && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Date:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setDateTo(e.target.value); }}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                />
              </div>
            )}
            {datePreset === "custom" && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                />
              </div>
            )}
            <div className="mt-1.5 text-[10px] text-slate-400">
              {datePreset === "1D"
                ? `${dateFrom} · 1 trading day`
                : `${dateFrom} → ${dateTo} · ~${tradingDays} trading days`
              }
            </div>
          </div>

          {/* Section 3: Candle Interval — dropdown */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <BarChart3 size={12} />
              Candle Interval
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <select
                  value={interval}
                  onChange={(e) => setInterval_(e.target.value as Interval)}
                  className="appearance-none rounded-md border border-slate-200 bg-white py-1.5 pl-3 pr-7 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {ALL_INTERVALS.map((iv) => (
                    <option key={iv} value={iv}>{INTERVAL_LABELS[iv]}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
              <div className="text-[10px] text-slate-400">
                ~{candlesPerStock.toLocaleString()} candles/stock
                {resolvedSymbols.length > 1 && (
                  <> · {totalCandles.toLocaleString()} total across {resolvedSymbols.length} stocks</>
                )}
              </div>
            </div>
            {totalCandles > 50000 && (
              <div className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                Large dataset — consider a coarser interval or fewer stocks for faster results
              </div>
            )}
          </div>

          {/* Section 4: Trading Parameters */}
          <div>
            <button
              onClick={() => setShowParams(!showParams)}
              className="mb-2 flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <Settings2 size={12} />
              Trading Parameters
              <ChevronDown size={12} className={cn("ml-auto transition-transform", showParams && "rotate-180")} />
            </button>
            {showParams && (
              <div className="grid grid-cols-3 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    <DollarSign size={9} className="mr-0.5 inline" />
                    Initial Capital
                  </label>
                  <input
                    type="number"
                    value={initialCapital}
                    onChange={(e) => setInitialCapital(Number(e.target.value) || 0)}
                    min={0}
                    step={10000}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    Max Trades/Day
                  </label>
                  <input
                    type="number"
                    value={maxTradesPerDay}
                    onChange={(e) => setMaxTradesPerDay(Number(e.target.value) || 1)}
                    min={1}
                    max={100}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    Position Size %
                  </label>
                  <input
                    type="number"
                    value={positionSizePct}
                    onChange={(e) => setPositionSizePct(Number(e.target.value) || 1)}
                    min={1}
                    max={100}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Strategy Info */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <TrendingUp size={12} />
              Strategy
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                  builderMode === "code"
                    ? "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400"
                    : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                )}>
                  {builderMode}
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  {builderMode === "code"
                    ? hasCode ? "Custom code strategy" : "No code written yet"
                    : "Visual condition builder"
                  }
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="text-[10px] text-slate-400">
            {resolvedSymbols.length} stock{resolvedSymbols.length !== 1 ? "s" : ""} · {INTERVAL_LABELS[interval]} · {datePreset === "custom" ? `${days}d` : datePreset} · ₹{initialCapital.toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleRun}
              disabled={!canRun}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Run Strategy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
