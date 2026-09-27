import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { SectionLabel } from "./SectionLabel";
import { ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Search, Plus, Pencil, Trash2 } from "lucide-react";
import { BatchModal, type BatchItem } from "./BatchModal";

interface ScreenerRow {
  symbol: string;
  name: string;
  sector: string;
  index: string[];
  ltp: number;
  change_pct: number;
  volume: number;
  avg_volume_20d: number;
  vol_ratio: number;
  volatility: number;
  day_range_pct: number;
  rsi: number;
  week52_high: number;
  week52_low: number;
  market_cap_cr: number;
  exchange?: string;
}

const INDEX_OPTIONS = ["ALL", "NIFTY50", "NIFTY200", "NIFTY500"];
const SECTOR_OPTIONS = [
  "All",
  "Automobile and Auto Components", "Capital Goods", "Chemicals",
  "Construction", "Construction Materials", "Consumer Durables",
  "Consumer Services", "Diversified", "Fast Moving Consumer Goods",
  "Financial Services", "Healthcare", "Information Technology",
  "Media Entertainment & Publication", "Metals & Mining",
  "Oil Gas & Consumable Fuels", "Power", "Realty", "Services",
  "Telecommunication", "Textiles",
];

type SortKey = "symbol" | "ltp" | "change_pct" | "volume" | "volatility" | "vol_ratio" | "rsi" | "market_cap_cr";

interface StockScreenerProps {
  onStockClick?: (symbol: string, name: string) => void;
  index?: string;
  onIndexChange?: (index: string) => void;
  sector?: string;
  onSectorChange?: (sector: string) => void;
}

export function StockScreener({
  onStockClick,
  index: indexProp,
  onIndexChange,
  sector: sectorProp,
  onSectorChange,
}: StockScreenerProps = {}) {
  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [indexFilterLocal, setIndexFilterLocal] = useState("NIFTY500");
  const [sectorFilterLocal, setSectorFilterLocal] = useState("All");
  const indexFilter = indexProp ?? indexFilterLocal;
  const sectorFilter = sectorProp ?? sectorFilterLocal;
  const setIndexFilter = useCallback((v: string) => {
    setIndexFilterLocal(v);
    onIndexChange?.(v);
  }, [onIndexChange]);
  const setSectorFilter = useCallback((v: string) => {
    setSectorFilterLocal(v);
    onSectorChange?.(v);
  }, [onSectorChange]);
  const [sortBy, setSortBy] = useState<SortKey>("market_cap_cr");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<BatchItem | null>(null);

  const fetchBatches = useCallback(async () => {
    try {
      const data = await apiFetch<BatchItem[]>("/batches");
      setBatches(data);
    } catch {
      setBatches([]);
    }
  }, []);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (indexFilter !== "ALL") params.set("index", indexFilter);
    if (sectorFilter !== "All") params.set("sector", sectorFilter);
    params.set("sort_by", sortBy);
    params.set("sort_dir", sortDir);
    try {
      const data = await apiFetch<ScreenerRow[]>(`/stocks/screener?${params}`);
      setRows(data);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, [indexFilter, sectorFilter, sortBy, sortDir]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(key === "symbol" ? "asc" : "desc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortBy !== col) return <ArrowUpDown size={10} className="ml-1 inline opacity-30" />;
    return sortDir === "asc"
      ? <ArrowUp size={10} className="ml-1 inline text-indigo-500" />
      : <ArrowDown size={10} className="ml-1 inline text-indigo-500" />;
  }

  const filteredRows = search.trim()
    ? rows.filter((r) => {
        const q = search.toLowerCase();
        return r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
      })
    : rows;

  const selectClass = "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-1 px-1 pb-2">
        <SectionLabel>Watchlist ({filteredRows.length}{search.trim() && filteredRows.length !== rows.length ? `/${rows.length}` : ""})</SectionLabel>
        <button onClick={fetchData} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-900" title="Refresh watchlist">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-2">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticker or company..."
          className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-7 pr-2 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:focus:border-indigo-400"
        />
      </div>

      {/* Filters */}
      <div className="mb-2 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <select value={indexFilter} onChange={(e) => setIndexFilter(e.target.value)} className={selectClass}>
            {INDEX_OPTIONS.map((o) => <option key={o} value={o}>{o === "ALL" ? "All Indices" : o}</option>)}
            {batches.length > 0 && <option disabled>──── Batches ────</option>}
            {batches.map((b) => (
              <option key={`batch-${b.id}`} value={`BATCH:${b.id}`}>
                {b.name} ({b.symbols.length})
              </option>
            ))}
          </select>
          <span className="text-[10px] text-slate-400">›</span>
          <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)} className={selectClass}>
            {SECTOR_OPTIONS.map((o) => <option key={o} value={o}>{o === "All" ? "All Industries" : o}</option>)}
          </select>
          <button
            onClick={() => { setEditingBatch(null); setBatchModalOpen(true); }}
            className="ml-auto flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-[10px] font-medium text-slate-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-400 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
            title="Create Batch"
          >
            <Plus size={11} />
            Batch
          </button>
          {indexFilter.startsWith("BATCH:") && (
            <>
              <button
                onClick={() => {
                  const b = batches.find((b) => `BATCH:${b.id}` === indexFilter);
                  if (b) { setEditingBatch(b); setBatchModalOpen(true); }
                }}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800"
                title="Edit Batch"
              >
                <Pencil size={11} />
              </button>
              <button
                onClick={async () => {
                  const id = indexFilter.split(":")[1];
                  await apiFetch(`/batches/${id}`, { method: "DELETE" });
                  setIndexFilter("NIFTY500");
                  fetchBatches();
                }}
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                title="Delete Batch"
              >
                <Trash2 size={11} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
            <tr className="border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800">
              <th className="px-2 py-1.5 text-right w-8">#</th>
              <th className="cursor-pointer px-2 py-1.5 hover:text-slate-600" onClick={() => toggleSort("symbol")}>Symbol<SortIcon col="symbol" /></th>
              <th className="px-2 py-1.5">Sector</th>
              <th className="cursor-pointer px-2 py-1.5 text-right hover:text-slate-600" onClick={() => toggleSort("ltp")}>LTP<SortIcon col="ltp" /></th>
              <th className="cursor-pointer px-2 py-1.5 text-right hover:text-slate-600" onClick={() => toggleSort("change_pct")}>Chg%<SortIcon col="change_pct" /></th>
              <th className="cursor-pointer px-2 py-1.5 text-right hover:text-slate-600" onClick={() => toggleSort("volume")}>Volume<SortIcon col="volume" /></th>
              <th className="cursor-pointer px-2 py-1.5 text-right hover:text-slate-600" onClick={() => toggleSort("vol_ratio")}>Vol Ratio<SortIcon col="vol_ratio" /></th>
              <th className="cursor-pointer px-2 py-1.5 text-right hover:text-slate-600" onClick={() => toggleSort("volatility")}>Vol(D)<SortIcon col="volatility" /></th>
              <th className="cursor-pointer px-2 py-1.5 text-right hover:text-slate-600" onClick={() => toggleSort("rsi")}>RSI<SortIcon col="rsi" /></th>
              <th className="cursor-pointer px-2 py-1.5 text-right hover:text-slate-600" onClick={() => toggleSort("market_cap_cr")}>MCap (Cr)<SortIcon col="market_cap_cr" /></th>
              <th className="px-2 py-1.5 text-right">52W Range</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr><td colSpan={11} className="px-2 py-6 text-center text-slate-400">{loading ? "Loading..." : "No stocks match filters."}</td></tr>
            ) : (
              filteredRows.map((r, idx) => {
                const range52 = r.week52_high - r.week52_low;
                const pos52 = range52 > 0 ? ((r.ltp - r.week52_low) / range52) * 100 : 50;
                return (
                  <tr
                    key={`${r.symbol}-${idx}`}
                    onClick={() => onStockClick?.(r.symbol, r.name)}
                    className={cn("border-b border-slate-100 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/50", onStockClick && "cursor-pointer")}
                  >
                    <td className="px-2 py-1 text-right text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-slate-700 dark:text-slate-200">{r.symbol}</span>
                        <span className={cn(
                          "rounded px-1 py-px text-[8px] font-bold leading-none",
                          (r.exchange || "NSE") === "BSE"
                            ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                            : "bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400"
                        )}>{r.exchange || "NSE"}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[100px]">{r.name}</div>
                    </td>
                    <td className="px-2 py-1">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{r.sector}</span>
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-slate-700 dark:text-slate-200">₹{r.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td className={cn("px-2 py-1 text-right font-mono font-medium", r.change_pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                      {r.change_pct >= 0 ? "+" : ""}{r.change_pct}%
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-slate-600 dark:text-slate-300">{formatVolume(r.volume)}</td>
                    <td className={cn("px-2 py-1 text-right font-mono", r.vol_ratio >= 1.5 ? "font-medium text-amber-600 dark:text-amber-400" : "text-slate-500")}>
                      {r.vol_ratio}x
                    </td>
                    <td className={cn("px-2 py-1 text-right font-mono", r.volatility >= 3 ? "text-red-500" : "text-slate-500")}>
                      {r.volatility}%
                    </td>
                    <td className="px-2 py-1 text-right font-mono">
                      <span className={cn(
                        r.rsi <= 30 && "text-emerald-600 font-medium dark:text-emerald-400",
                        r.rsi >= 70 && "text-red-600 font-medium dark:text-red-400",
                        r.rsi > 30 && r.rsi < 70 && "text-slate-500",
                      )}>{r.rsi}</span>
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-slate-500">{formatMcap(r.market_cap_cr)}</td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-slate-400">{formatPrice(r.week52_low)}</span>
                        <div className="relative h-1.5 w-16 rounded-full bg-slate-200 dark:bg-slate-800">
                          <div className="absolute left-0 top-0 h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(Math.max(pos52, 2), 98)}%` }} />
                        </div>
                        <span className="text-[9px] text-slate-400">{formatPrice(r.week52_high)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <BatchModal
        open={batchModalOpen}
        onClose={() => { setBatchModalOpen(false); setEditingBatch(null); }}
        onBatchSaved={fetchBatches}
        editBatch={editingBatch}
      />
    </div>
  );
}

function formatVolume(v: number): string {
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `${(v / 100_000).toFixed(1)}L`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return v.toString();
}

function formatMcap(cr: number): string {
  if (cr >= 100_000) return `${(cr / 100_000).toFixed(1)}L Cr`;
  return `${cr.toLocaleString("en-IN")} Cr`;
}

function formatPrice(p: number): string {
  if (p >= 10000) return `${(p / 1000).toFixed(0)}K`;
  return p.toFixed(0);
}
