import { useState, useEffect, useMemo } from "react";
import { X, Search, Check } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";

export interface BatchItem {
  id: number;
  name: string;
  symbols: string[];
  created_at: string | null;
  updated_at: string | null;
}

interface BatchModalProps {
  open: boolean;
  onClose: () => void;
  onBatchSaved: () => void;
  editBatch?: BatchItem | null;
}

interface StockOption {
  symbol: string;
  name: string;
  sector: string;
  exchange?: string;
  index?: string[];
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

export function BatchModal({ open, onClose, onBatchSaved, editBatch }: BatchModalProps) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [stocks, setStocks] = useState<StockOption[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [indexFilter, setIndexFilter] = useState("NIFTY500");
  const [sectorFilter, setSectorFilter] = useState("All");
  const [importBatch, setImportBatch] = useState("");

  useEffect(() => {
    if (!open) return;
    apiFetch<StockOption[]>("/stocks/universe-db?index=ALL").then(setStocks).catch(() => {});
    apiFetch<BatchItem[]>("/batches").then(setBatches).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (open && editBatch) {
      setName(editBatch.name);
      setSelected(new Set(editBatch.symbols));
    } else if (open) {
      setName("");
      setSelected(new Set());
    }
    setSearch("");
    setIndexFilter("NIFTY500");
    setSectorFilter("All");
    setImportBatch("");
  }, [open, editBatch]);

  const filtered = useMemo(() => {
    let list = stocks;

    if (indexFilter && indexFilter !== "ALL") {
      list = list.filter((s) => s.index?.includes(indexFilter));
    }
    if (sectorFilter && sectorFilter !== "All") {
      list = list.filter((s) => s.sector === sectorFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [stocks, search, indexFilter, sectorFilter]);

  function toggle(symbol: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  function selectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of filtered) next.add(s.symbol);
      return next;
    });
  }

  function deselectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of filtered) next.delete(s.symbol);
      return next;
    });
  }

  function handleImportBatch(batchId: string) {
    setImportBatch(batchId);
    if (!batchId) return;
    const batch = batches.find((b) => b.id === Number(batchId));
    if (batch) {
      if (!name.trim()) setName(batch.name);
      setSelected(new Set(batch.symbols));
      setIndexFilter("ALL");
      setSectorFilter("All");
      setSearch("");
    }
  }

  async function handleSave() {
    if (!name.trim() || selected.size === 0) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), symbols: [...selected] };
      if (editBatch) {
        await apiFetch(`/batches/${editBatch.id}`, { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
      } else {
        await apiFetch("/batches", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
      }
      onBatchSaved();
      onClose();
    } catch {
      // ignore
    }
    setSaving(false);
  }

  if (!open) return null;

  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.symbol));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="flex h-[85vh] w-[90vw] max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {editBatch ? "Edit Batch" : "Create Batch"}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Select stocks to add to your watchlist batch
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X size={20} />
          </button>
        </div>

        {/* Batch name */}
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <label className="mb-1 block text-xs font-medium text-slate-500">Batch Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My Momentum Picks, Banking Watchlist..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-2.5 dark:border-slate-700">
          <select
            value={indexFilter}
            onChange={(e) => setIndexFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {INDEX_OPTIONS.map((o) => (
              <option key={o} value={o}>{o === "ALL" ? "All Indices" : o}</option>
            ))}
          </select>

          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {SECTOR_OPTIONS.map((o) => (
              <option key={o} value={o}>{o === "All" ? "All Industries" : o}</option>
            ))}
          </select>

          {batches.length > 0 && (
            <select
              value={importBatch}
              onChange={(e) => handleImportBatch(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">Import from batch...</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.symbols.length})</option>
              ))}
            </select>
          )}
        </div>

        {/* Search + selected count + select all */}
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-2.5 dark:border-slate-700">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stocks..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
          <span className="shrink-0 text-[10px] text-slate-400">
            {filtered.length} shown
          </span>
          <button
            onClick={allFilteredSelected ? deselectAll : selectAll}
            className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {allFilteredSelected ? "Deselect all" : "Select all"}
          </button>
          {selected.size > 0 && (
            <span className="shrink-0 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {selected.size} selected
            </span>
          )}
        </div>

        {/* Stock list */}
        <div className="flex-1 overflow-y-auto px-5 py-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">No stocks found.</div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((s, idx) => {
                const isSelected = selected.has(s.symbol);
                const exchange = s.exchange || "NSE";
                return (
                  <button
                    key={s.symbol}
                    onClick={() => toggle(s.symbol)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors",
                      isSelected
                        ? "bg-indigo-50 dark:bg-indigo-950/40"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    )}
                  >
                    <span className="w-7 shrink-0 text-[10px] text-slate-400 text-right">{idx + 1}</span>
                    <div className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                      isSelected
                        ? "border-indigo-500 bg-indigo-500 text-white"
                        : "border-slate-300 dark:border-slate-600"
                    )}>
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{s.symbol}</span>
                      <span className="ml-2 text-xs text-slate-400 truncate">{s.name}</span>
                    </div>
                    <span className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                      exchange === "BSE"
                        ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                        : "bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400"
                    )}>
                      {exchange}
                    </span>
                    {s.sector && (
                      <span className="shrink-0 max-w-[140px] truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {s.sector}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <p className="text-xs text-slate-400">
            {selected.size === 0 ? "Select at least one stock" : `${selected.size} stock${selected.size > 1 ? "s" : ""} in batch`}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || selected.size === 0 || saving}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : editBatch ? "Update Batch" : "Save Batch"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
