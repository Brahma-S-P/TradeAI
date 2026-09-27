import { useState, useMemo } from "react";
import { X, Database, Search, Calendar, BarChart3, Clock, Play } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";

interface SymbolSummary {
  symbol: string;
  candle_count: number;
  first_date: string | null;
  last_date: string | null;
  last_close: number | null;
  updated_at: string | null;
}

interface DataSummary {
  total_symbols: number;
  symbols: SymbolSummary[];
}

interface IntradaySymbol {
  symbol: string;
  interval: string;
  candle_count: number;
  first_date: string | null;
  last_date: string | null;
}

interface IntradaySummary {
  total_symbols: number;
  total_candles: number;
  symbols: IntradaySymbol[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = "daily" | "intraday";
type SortKey = "symbol" | "candles" | "last_date" | "last_close";
type IntradaySortKey = "symbol" | "candles" | "last_date";

export function HistoricalDataModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("daily");
  const { data: dailyData, loading: dailyLoading } = useApi<DataSummary>(open ? "/snapshot/data-summary" : null);
  const { data: intradayData, loading: intradayLoading, refetch: refetchIntraday } = useApi<IntradaySummary>(open ? "/snapshot/intraday-summary" : null);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("symbol");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [iSort, setISort] = useState<IntradaySortKey>("symbol");
  const [iSortDir, setISortDir] = useState<"asc" | "desc">("asc");
  const [pulling, setPulling] = useState(false);

  const filtered = useMemo(() => {
    if (!dailyData) return [];
    let list = dailyData.symbols;
    if (search) {
      const q = search.toUpperCase();
      list = list.filter((s) => s.symbol.includes(q));
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sort === "symbol") cmp = a.symbol.localeCompare(b.symbol);
      else if (sort === "candles") cmp = a.candle_count - b.candle_count;
      else if (sort === "last_date") cmp = (a.last_date || "").localeCompare(b.last_date || "");
      else if (sort === "last_close") cmp = (a.last_close || 0) - (b.last_close || 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [dailyData, search, sort, sortDir]);

  const intradayFiltered = useMemo(() => {
    if (!intradayData) return [];
    let list = intradayData.symbols;
    if (search) {
      const q = search.toUpperCase();
      list = list.filter((s) => s.symbol.includes(q));
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (iSort === "symbol") cmp = a.symbol.localeCompare(b.symbol);
      else if (iSort === "candles") cmp = a.candle_count - b.candle_count;
      else if (iSort === "last_date") cmp = (a.last_date || "").localeCompare(b.last_date || "");
      return iSortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [intradayData, search, iSort, iSortDir]);

  const toggleSort = (col: SortKey) => {
    if (sort === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(col); setSortDir("asc"); }
  };
  const toggleISort = (col: IntradaySortKey) => {
    if (iSort === col) setISortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setISort(col); setISortDir("asc"); }
  };

  const arrow = (col: SortKey) => sort === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";
  const iArrow = (col: IntradaySortKey) => iSort === col ? (iSortDir === "asc" ? " ▲" : " ▼") : "";

  const totalCandles = dailyData?.symbols.reduce((s, r) => s + r.candle_count, 0) || 0;
  const dateRange = useMemo(() => {
    if (!dailyData || !dailyData.symbols.length) return { first: "–", last: "–" };
    const dates = dailyData.symbols.filter((s) => s.first_date).map((s) => s.first_date!).sort();
    const lastDates = dailyData.symbols.filter((s) => s.last_date).map((s) => s.last_date!).sort();
    return { first: dates[0] || "–", last: lastDates[lastDates.length - 1] || "–" };
  }, [dailyData]);

  async function handlePullIntraday() {
    setPulling(true);
    try {
      await apiPost("/snapshot/intraday", { interval: "5minute" });
    } catch { /* ignore */ }
  }

  if (!open) return null;

  const loading = tab === "daily" ? dailyLoading : intradayLoading;
  const data = tab === "daily" ? dailyData : intradayData;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Database size={18} className="text-indigo-500" />
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Historical Data Store</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200 px-5 dark:border-slate-700">
          <button
            onClick={() => setTab("daily")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              tab === "daily"
                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            )}
          >
            <BarChart3 size={12} />
            Daily Candles
            {dailyData && <span className="ml-1 text-[10px] opacity-60">({dailyData.total_symbols})</span>}
          </button>
          <button
            onClick={() => setTab("intraday")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              tab === "intraday"
                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            )}
          >
            <Clock size={12} />
            5-Min Candles
            {intradayData && <span className="ml-1 text-[10px] opacity-60">({intradayData.total_symbols})</span>}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">Loading data summary…</div>
        ) : !data || (tab === "daily" && dailyData?.total_symbols === 0) || (tab === "intraday" && intradayData?.total_symbols === 0) ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <Database size={32} className="text-slate-300" />
            {tab === "daily" ? (
              <>
                <p>No daily data stored yet.</p>
                <p className="text-xs">Use "Sync Data" to load daily candles.</p>
              </>
            ) : (
              <>
                <p>No intraday data stored yet.</p>
                <p className="text-xs">Pull 5-minute candles for all NSE equities.</p>
                <button
                  onClick={handlePullIntraday}
                  disabled={pulling}
                  className="mt-3 flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-600 disabled:opacity-50"
                >
                  <Play size={14} />
                  {pulling ? "Pull Started..." : "Pull 5-Min Candles (All NSE)"}
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Stats bar */}
            <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 px-5 py-2.5 text-xs dark:border-slate-800">
              {tab === "daily" ? (
                <>
                  <span className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
                    <BarChart3 size={12} className="text-indigo-500" />
                    {dailyData!.total_symbols.toLocaleString()} symbols
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {totalCandles.toLocaleString()} total candles
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                    <Calendar size={11} />
                    {dateRange.first} → {dateRange.last}
                  </span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
                    <Clock size={12} className="text-indigo-500" />
                    {intradayData!.total_symbols.toLocaleString()} symbols
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {intradayData!.total_candles.toLocaleString()} candles (5-min)
                  </span>
                  <span className="ml-auto" />
                  <button
                    onClick={handlePullIntraday}
                    disabled={pulling}
                    className="flex items-center gap-1.5 rounded-md border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-400"
                  >
                    <Play size={10} />
                    {pulling ? "Running..." : "Pull Latest"}
                  </button>
                </>
              )}
            </div>

            {/* Search */}
            <div className="border-b border-slate-100 px-5 py-2 dark:border-slate-800">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search symbol..."
                  className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              {tab === "daily" ? (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80">
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="cursor-pointer px-5 py-2 hover:text-slate-600" onClick={() => toggleSort("symbol")}>
                        Symbol{arrow("symbol")}
                      </th>
                      <th className="cursor-pointer px-3 py-2 text-right hover:text-slate-600" onClick={() => toggleSort("candles")}>
                        Candles{arrow("candles")}
                      </th>
                      <th className="px-3 py-2">First Date</th>
                      <th className="cursor-pointer px-3 py-2 hover:text-slate-600" onClick={() => toggleSort("last_date")}>
                        Last Date{arrow("last_date")}
                      </th>
                      <th className="cursor-pointer px-3 py-2 text-right hover:text-slate-600" onClick={() => toggleSort("last_close")}>
                        Last Close{arrow("last_close")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filtered.map((s) => (
                      <tr key={s.symbol} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-1.5 font-medium text-slate-700 dark:text-slate-200">{s.symbol}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{s.candle_count.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-slate-400">{s.first_date || "–"}</td>
                        <td className="px-3 py-1.5 text-slate-400">{s.last_date || "–"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {s.last_close != null ? `₹${s.last_close.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80">
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="cursor-pointer px-5 py-2 hover:text-slate-600" onClick={() => toggleISort("symbol")}>
                        Symbol{iArrow("symbol")}
                      </th>
                      <th className="px-3 py-2">Interval</th>
                      <th className="cursor-pointer px-3 py-2 text-right hover:text-slate-600" onClick={() => toggleISort("candles")}>
                        Candles{iArrow("candles")}
                      </th>
                      <th className="px-3 py-2">First</th>
                      <th className="cursor-pointer px-3 py-2 hover:text-slate-600" onClick={() => toggleISort("last_date")}>
                        Last{iArrow("last_date")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {intradayFiltered.map((s) => (
                      <tr key={s.symbol} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-1.5 font-medium text-slate-700 dark:text-slate-200">{s.symbol}</td>
                        <td className="px-3 py-1.5 text-slate-400">{s.interval}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{s.candle_count.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-slate-400">{s.first_date || "–"}</td>
                        <td className="px-3 py-1.5 text-slate-400">{s.last_date || "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {((tab === "daily" && filtered.length === 0) || (tab === "intraday" && intradayFiltered.length === 0)) && search && (
                <div className="py-8 text-center text-xs text-slate-400">No symbols match "{search}"</div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 px-5 py-2 text-[10px] text-slate-400 dark:border-slate-700">
              {tab === "daily"
                ? `Showing ${filtered.length} of ${dailyData!.total_symbols} symbols`
                : `Showing ${intradayFiltered.length} of ${intradayData!.total_symbols} symbols`}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
