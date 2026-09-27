import { useRef, useState, useMemo } from "react";
import {
  Search,
  Folder,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Trash2,
  X,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/cn";

export interface AnalyzerStockItem {
  id: number;
  symbol: string;
  name: string;
  price: number;
  matched_criteria: string;
  strategy_name: string;
  strategy_type: string;
  index_filter: string;
  sector_filter: string;
  run_id: string;
  folder_id: number | null;
  position: number;
  created_at: string | null;
}

export interface AnalyzerRunGroup {
  run_id: string;
  strategy_name: string;
  strategy_type: string;
  index_filter: string;
  sector_filter: string;
  created_at: string | null;
  folder_id: number | null;
  position: number;
  stocks: AnalyzerStockItem[];
}

export interface AnalyzerFolderItem {
  id: number;
  name: string;
  position: number;
}

interface SignalInfo {
  symbol: string;
  signal: string;
}

interface AnalyzerStocksPanelProps {
  runs: AnalyzerRunGroup[];
  folders: AnalyzerFolderItem[];
  selectedSymbol: string | null;
  signalMap: Map<string, SignalInfo>;
  onSelectStock: (symbol: string, name: string) => void;
  onDeleteStock: (id: number, symbol: string) => void;
  onDeleteRun: (runId: string) => void;
  onCreateFolder: (name: string) => void;
  onDeleteFolder: (id: number, deleteBatches: boolean) => void;
  onRenameFolder: (id: number, name: string) => void;
  onMoveRun: (runId: string, folderId: number | null, position: number) => void;
  onReorder: (items: { type: string; id: string; position: number }[]) => void;
}

type DateFilter = "all" | "today" | "7d" | "30d" | "custom";

type DragData = { kind: "folder"; id: number } | { kind: "run"; runId: string };

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function matchesDateFilter(
  createdAt: string | null,
  filter: DateFilter,
  customFrom: string,
  customTo: string,
): boolean {
  if (filter === "all" || !createdAt) return true;
  const d = new Date(createdAt);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  if (filter === "today") return days < 1;
  if (filter === "7d") return days < 7;
  if (filter === "30d") return days < 30;
  if (filter === "custom") {
    if (customFrom && d < new Date(customFrom)) return false;
    if (customTo) {
      const to = new Date(customTo);
      to.setHours(23, 59, 59, 999);
      if (d > to) return false;
    }
    return true;
  }
  return true;
}

export function AnalyzerStocksPanel({
  runs,
  folders,
  selectedSymbol,
  signalMap,
  onSelectStock,
  onDeleteStock,
  onDeleteRun,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  onMoveRun,
  onReorder,
}: AnalyzerStocksPanelProps) {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [openFolders, setOpenFolders] = useState<Set<number>>(new Set());
  const [collapsedRuns, setCollapsedRuns] = useState<Set<string>>(new Set());
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<
    | { type: "run"; runId: string }
    | { type: "folder"; id: number }
    | { type: "stock"; stockId: number; symbol: string }
    | null
  >(null);
  const [dropOnFolder, setDropOnFolder] = useState<number | null>(null);
  const dragDataRef = useRef<DragData | null>(null);

  const searchLower = search.toLowerCase();

  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      if (!matchesDateFilter(r.created_at, dateFilter, customFrom, customTo)) return false;
      if (!searchLower) return true;
      if (r.strategy_name.toLowerCase().includes(searchLower)) return true;
      if (r.stocks.some((s) => s.symbol.toLowerCase().includes(searchLower) || s.name.toLowerCase().includes(searchLower)))
        return true;
      return false;
    });
  }, [runs, dateFilter, customFrom, customTo, searchLower]);

  const rootRuns = filteredRuns.filter((r) => r.folder_id == null).sort((a, b) => a.position - b.position);

  function runsInFolder(folderId: number) {
    return filteredRuns.filter((r) => r.folder_id === folderId).sort((a, b) => a.position - b.position);
  }

  function toggleFolder(id: number) {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleRun(runId: string) {
    setCollapsedRuns((prev) => {
      const next = new Set(prev);
      next.has(runId) ? next.delete(runId) : next.add(runId);
      return next;
    });
  }

  function handleDragStart(data: DragData, e: React.DragEvent) {
    dragDataRef.current = data;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify(data));
    (e.target as HTMLElement).style.opacity = "0.5";
  }

  function handleDragEnd(e: React.DragEvent) {
    (e.target as HTMLElement).style.opacity = "";
    setDropOnFolder(null);
    dragDataRef.current = null;
  }

  function handleFolderDragOver(e: React.DragEvent, folderId: number) {
    e.preventDefault();
    e.stopPropagation();
    const dragged = dragDataRef.current;
    if (dragged?.kind === "run") {
      setDropOnFolder(folderId);
    }
  }

  function handleFolderDrop(e: React.DragEvent, folderId: number) {
    e.preventDefault();
    e.stopPropagation();
    setDropOnFolder(null);
    const dragged = dragDataRef.current;
    dragDataRef.current = null;
    if (dragged?.kind === "run") {
      const nextPos = runsInFolder(folderId).length;
      onMoveRun(dragged.runId, folderId, nextPos);
    }
  }

  function handleRootDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropOnFolder(null);
    const dragged = dragDataRef.current;
    dragDataRef.current = null;
    if (dragged?.kind === "run") {
      onMoveRun(dragged.runId, null, rootRuns.length);
    }
  }

  function startRenameFolder(id: number, currentName: string) {
    setEditingFolderId(id);
    setEditFolderName(currentName);
  }

  function commitRenameFolder() {
    if (editingFolderId != null && editFolderName.trim()) {
      onRenameFolder(editingFolderId, editFolderName.trim());
    }
    setEditingFolderId(null);
    setEditFolderName("");
  }

  const dateFilterOptions: { value: DateFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "today", label: "Today" },
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
  ];

  function renderRunGroup(run: AnalyzerRunGroup, inFolder = false) {
    const isCollapsed = collapsedRuns.has(run.run_id);
    return (
      <div
        key={run.run_id}
        draggable
        onDragStart={(e) => handleDragStart({ kind: "run", runId: run.run_id }, e)}
        onDragEnd={handleDragEnd}
        className="rounded-lg border border-slate-200 dark:border-slate-800"
      >
        <div
          className="flex cursor-pointer items-center justify-between bg-slate-50 px-2 py-1.5 dark:bg-slate-900/50"
          onClick={() => toggleRun(run.run_id)}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <GripVertical size={10} className="shrink-0 cursor-grab text-slate-300 dark:text-slate-600" />
            {isCollapsed ? (
              <ChevronRight size={12} className="shrink-0 text-slate-400" />
            ) : (
              <ChevronDown size={12} className="shrink-0 text-slate-400" />
            )}
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                {run.strategy_name || "Unnamed"}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span
                  className={cn(
                    "rounded px-1 py-px text-[8px] font-bold uppercase",
                    run.strategy_type === "code"
                      ? "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400"
                      : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                  )}
                >
                  {run.strategy_type}
                </span>
                <span>{run.index_filter}</span>
                <span>· {run.stocks.length} stocks</span>
              </div>
              {run.created_at && (
                <div className="text-[10px] text-slate-400">
                  {new Date(run.created_at).toLocaleString()}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            {inFolder && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveRun(run.run_id, null, rootRuns.length);
                }}
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Move out of folder"
              >
                <Folder size={12} />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete({ type: "run", runId: run.run_id });
              }}
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
              title="Remove this run"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
        {!isCollapsed && (
          <ul className="py-0.5">
            {run.stocks.map((s) => {
              const sig = signalMap.get(s.symbol);
              return (
                <li key={s.id} className="group flex items-center">
                  <button
                    onClick={() => onSelectStock(s.symbol, s.name)}
                    className={cn(
                      "flex flex-1 items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      selectedSymbol === s.symbol
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="font-medium">{s.symbol}</span>
                      {sig && (
                        <span
                          className={cn(
                            "rounded px-1 py-px text-[8px] font-bold uppercase",
                            sig.signal === "buy" &&
                              "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
                            sig.signal === "sell" &&
                              "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
                            sig.signal === "hold" &&
                              "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                          )}
                        >
                          {sig.signal}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-xs">₹{s.price.toFixed(2)}</span>
                  </button>
                  <button
                    onClick={() => setConfirmDelete({ type: "stock", stockId: s.id, symbol: s.symbol })}
                    className="mr-1 hidden shrink-0 rounded p-0.5 text-slate-400 hover:text-red-500 group-hover:block"
                    title="Remove"
                  >
                    <Trash2 size={10} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search + Date filter + New Folder */}
      <div className="space-y-1.5 px-3 pt-2 pb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stocks or runs..."
              className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs outline-none placeholder:text-slate-400 focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
              >
                <X size={11} />
              </button>
            )}
          </div>
          {addingFolder ? (
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={() => {
                if (newFolderName.trim()) onCreateFolder(newFolderName.trim());
                setAddingFolder(false);
                setNewFolderName("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolderName.trim()) {
                  onCreateFolder(newFolderName.trim());
                  setAddingFolder(false);
                  setNewFolderName("");
                }
                if (e.key === "Escape") {
                  setAddingFolder(false);
                  setNewFolderName("");
                }
              }}
              placeholder="Folder name..."
              className="w-24 shrink-0 rounded-md border border-indigo-400 bg-white px-2 py-1.5 text-xs outline-none dark:border-indigo-500 dark:bg-slate-900 dark:text-slate-200"
            />
          ) : (
            <button
              onClick={() => setAddingFolder(true)}
              className="flex shrink-0 items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-1.5 text-[10px] font-medium text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
              title="New folder"
            >
              <FolderPlus size={11} />
            </button>
          )}
        </div>
        {/* Date filter row: presets + calendar */}
        <div className="flex flex-wrap items-center gap-1">
          <Calendar size={10} className="shrink-0 text-slate-400" />
          {dateFilterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDateFilter(opt.value)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                dateFilter === opt.value
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => setDateFilter("custom")}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
              dateFilter === "custom"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            Custom
          </button>
        </div>
        {dateFilter === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              max={customTo || toDateStr(new Date())}
              className="flex-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px] outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [color-scheme:dark]"
            />
            <span className="text-[10px] text-slate-400">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              min={customFrom}
              max={toDateStr(new Date())}
              className="flex-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px] outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [color-scheme:dark]"
            />
          </div>
        )}
      </div>

      {/* Folders + Runs */}
      <div
        className="flex-1 overflow-y-auto px-3 pb-3"
        onDragOver={(e) => {
          e.preventDefault();
          if (dragDataRef.current?.kind === "run") setDropOnFolder(null);
        }}
        onDrop={handleRootDrop}
      >
        {filteredRuns.length === 0 && folders.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            {search || dateFilter !== "all"
              ? "No matching runs."
              : "No stocks yet. Run a strategy in the Picker tab and click 'Send to Analyzer'."}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Folders */}
            {folders
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((f) => {
                const isOpen = openFolders.has(f.id);
                const folderRuns = runsInFolder(f.id);
                const isDropTarget = dropOnFolder === f.id;
                return (
                  <div
                    key={`folder-${f.id}`}
                    className={cn(
                      "rounded-lg border transition-colors",
                      isDropTarget
                        ? "border-emerald-400 bg-emerald-50/50 dark:border-emerald-500 dark:bg-emerald-950/30"
                        : "border-slate-200 dark:border-slate-800"
                    )}
                    onDragOver={(e) => handleFolderDragOver(e, f.id)}
                    onDragLeave={() => setDropOnFolder(null)}
                    onDrop={(e) => handleFolderDrop(e, f.id)}
                  >
                    <div
                      className="group flex cursor-pointer items-center justify-between px-2 py-1.5"
                      onClick={() => toggleFolder(f.id)}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <GripVertical
                          size={10}
                          className="shrink-0 cursor-grab text-slate-300 dark:text-slate-600"
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            handleDragStart({ kind: "folder", id: f.id }, e);
                          }}
                          onDragEnd={handleDragEnd}
                        />
                        {isOpen ? (
                          <ChevronDown size={12} className="shrink-0 text-slate-400" />
                        ) : (
                          <ChevronRight size={12} className="shrink-0 text-slate-400" />
                        )}
                        <Folder size={13} className="shrink-0 text-amber-500" />
                        {editingFolderId === f.id ? (
                          <input
                            autoFocus
                            value={editFolderName}
                            onChange={(e) => setEditFolderName(e.target.value)}
                            onBlur={commitRenameFolder}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRenameFolder();
                              if (e.key === "Escape") {
                                setEditingFolderId(null);
                                setEditFolderName("");
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="min-w-0 flex-1 rounded border border-indigo-400 bg-white px-1.5 py-0.5 text-xs outline-none dark:bg-slate-900 dark:text-slate-200"
                          />
                        ) : (
                          <span
                            className="truncate text-xs font-medium text-slate-700 dark:text-slate-200"
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              startRenameFolder(f.id, f.name);
                            }}
                          >
                            {f.name}
                          </span>
                        )}
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[9px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {folderRuns.length}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete({ type: "folder", id: f.id });
                        }}
                        className="shrink-0 rounded p-1 text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-950"
                        title="Delete folder"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    {isOpen && (
                      <div className="space-y-1.5 px-2 pb-2">
                        {folderRuns.length === 0 ? (
                          <div className="py-3 text-center text-[10px] text-slate-400">
                            Empty folder. Drag a run here.
                          </div>
                        ) : (
                          folderRuns.map((r) => renderRunGroup(r, true))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* Root (unfiled) runs */}
            {rootRuns.map((r) => renderRunGroup(r, false))}

          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Delete {confirmDelete.type === "folder" ? "Folder" : confirmDelete.type === "run" ? "Run" : "Stock"}?
            </h3>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {confirmDelete.type === "folder"
                ? "What should happen to the batches inside this folder?"
                : confirmDelete.type === "run"
                  ? "All stocks in this run will be permanently deleted. This cannot be undone."
                  : "This stock will be removed from the run. This cannot be undone."}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              {confirmDelete.type === "folder" ? (
                <>
                  <button
                    onClick={() => {
                      onDeleteFolder(confirmDelete.id, false);
                      setConfirmDelete(null);
                    }}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Keep Batches
                  </button>
                  <button
                    onClick={() => {
                      onDeleteFolder(confirmDelete.id, true);
                      setConfirmDelete(null);
                    }}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Delete All
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    if (confirmDelete.type === "run") onDeleteRun(confirmDelete.runId);
                    else onDeleteStock(confirmDelete.stockId, confirmDelete.symbol);
                    setConfirmDelete(null);
                  }}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
