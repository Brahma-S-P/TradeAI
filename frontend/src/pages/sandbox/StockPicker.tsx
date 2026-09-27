import { useState, useRef, useEffect, useCallback } from "react";
import { type ImperativePanelHandle } from "react-resizable-panels";
import { Trash2, Check, Send, Code2, PanelLeftOpen, PanelLeftClose, LayoutGrid, Monitor, ChevronsDown, ChevronsUp, Activity, RefreshCw } from "lucide-react";
import { ResizableGroup, Panel, ResizeHandle } from "@/components/panels/ResizablePanel";
import { CollapsibleChatPanel } from "@/components/panels/CollapsibleChatPanel";
import { SectionLabel } from "@/components/panels/SectionLabel";
import { RunControls } from "@/components/panels/RunControls";
import { SaveStrategyButton } from "@/components/panels/SaveStrategyButton";

import { StrategyBookmarksBar, type BarStrategy, type BarFolder } from "@/components/panels/StrategyBookmarksBar";

import { SaveStrategyModal, type FolderChoice } from "@/components/panels/SaveStrategyModal";
import { IndicatorBrowser, type IndicatorFilter } from "@/components/panels/IndicatorBrowser";
import { IndicatorCatalogModal } from "@/components/panels/IndicatorCatalogModal";
import { StockScreener } from "@/components/panels/StockScreener";
import { StockChartPanel } from "@/components/panels/StockChartPanel";
import { MultiChartGrid, type MultiChartItem } from "@/components/panels/MultiChartGrid";
import { LiveTickerTable } from "@/components/panels/LiveTickerTable";
import { useApi } from "@/lib/useApi";
import { apiFetch, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";

type ChartViewMode = "single" | "multi";

const MULTI_CHARTS_KEY = "trading-multi-charts";
const CHART_VIEW_KEY = "trading-chart-view";

function loadMultiCharts(): MultiChartItem[] {
  try {
    const raw = localStorage.getItem(MULTI_CHARTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveMultiCharts(charts: MultiChartItem[]) {
  try { localStorage.setItem(MULTI_CHARTS_KEY, JSON.stringify(charts)); } catch {}
}

function loadChartView(): ChartViewMode {
  try {
    const v = localStorage.getItem(CHART_VIEW_KEY);
    return v === "multi" ? "multi" : "single";
  } catch { return "single"; }
}

interface PickedStock {
  symbol: string;
  name: string;
  price: number;
  matched_criteria: string;
  timestamp: string;
}

interface StoredStrategy {
  id: string;
  name: string;
  version: number;
  strategy_type: string;
  updated_at: string;
  code: string;
  filters?: IndicatorFilter[];
  index_filter?: string;
  folder_id?: number | null;
  position?: number;
  parent_id?: number | null;
  version_count?: number;
}

export function StockPicker() {
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "completed" | "error">("idle");
  const [results, setResults] = useState<PickedStock[]>([]);
  const [code, setCode] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<IndicatorFilter[]>([]);
  const [selectedIndex, setSelectedIndex] = useState("NIFTY500");
  const [selectedSector, setSelectedSector] = useState("All");
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [saveModalType, setSaveModalType] = useState<"manual" | "code" | null>(null);
  const { data: strategies, refetch: refetchStrategies } = useApi<StoredStrategy[]>("/strategies?context=picker");
  const { data: folders, refetch: refetchFolders } = useApi<BarFolder[]>("/strategy-folders?context=picker");
  const [chartStock, setChartStock] = useState<{ symbol: string; name?: string } | null>(null);
  const codePanelRef = useRef<ImperativePanelHandle>(null);
  const [codePanelCollapsed, setCodePanelCollapsed] = useState(false);
  const tickerPanelRef = useRef<ImperativePanelHandle>(null);
  const [tickerCollapsed, setTickerCollapsed] = useState(false);
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>(loadChartView);
  const [multiCharts, setMultiCharts] = useState<MultiChartItem[]>(loadMultiCharts);
  const [highlightChartId, setHighlightChartId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [versions, setVersions] = useState<StoredStrategy[]>([]);
  const [updatePopupOpen, setUpdatePopupOpen] = useState(false);
  const updatePopupRef = useRef<HTMLDivElement>(null);
  const [confirmDeleteVersion, setConfirmDeleteVersion] = useState(false);

  useEffect(() => {
    if (!updatePopupOpen) return;
    function close(e: MouseEvent) {
      if (updatePopupRef.current && !updatePopupRef.current.contains(e.target as Node)) {
        setUpdatePopupOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [updatePopupOpen]);

  async function handleManualRun() {
    setRunStatus("running");
    try {
      const data = await apiPost<PickedStock[]>("/stocks/picker/run/manual", {
        filters: filters.map((f) => ({ id: f.id, operator: f.operator, value: f.value, value2: f.value2 })),
        index: selectedIndex,
        sector: selectedSector,
      });
      setResults(Array.isArray(data) ? data : []);
      setRunStatus("completed");
    } catch {
      setRunStatus("error");
    }
  }

  async function handleCodeRun() {
    if (!code) return;
    setRunStatus("running");
    try {
      const data = await apiPost<PickedStock[]>("/stocks/picker/run/code", {
        code,
        index: selectedIndex,
      });
      setResults(Array.isArray(data) ? data : []);
      setRunStatus(Array.isArray(data) ? "completed" : "error");
    } catch {
      setRunStatus("error");
    }
  }

  function handleCatalogClose() {
    setCatalogOpen(false);
    const existingIds = new Set(filters.map((f) => f.id));
    const newFilters: IndicatorFilter[] = [];
    for (const id of selectedIds) {
      if (!existingIds.has(id)) {
        newFilters.push({ id, operator: ">", value: "", value2: "" });
      }
    }
    setFilters((prev) => [
      ...prev.filter((f) => selectedIds.has(f.id)),
      ...newFilters,
    ]);
  }

  function handleFiltersChange(next: IndicatorFilter[]) {
    setFilters(next);
    setSelectedIds(new Set(next.map((f) => f.id)));
  }

  async function handleSaveStrategy(name: string, folder: FolderChoice) {
    const type = saveModalType;
    setSaveModalType(null);
    if (!type) return;

    let folderId: number;
    if ("newFolderName" in folder) {
      const created = await apiPost<BarFolder>("/strategy-folders", { name: folder.newFolderName, context: "picker" });
      folderId = created.id;
    } else {
      folderId = folder.folderId;
    }

    await apiPost("/strategies", {
      name,
      strategy_type: type,
      code: type === "code" ? code : "",
      filters: type === "manual" ? filters : [],
      index_filter: selectedIndex,
      description: "",
      folder_id: folderId,
    });
    refetchStrategies();
    refetchFolders();
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function handleUpdateClick() {
    if (!selectedStrategyId) return;
    setUpdatePopupOpen(true);
  }

  async function handleUpdateSameVersion() {
    setUpdatePopupOpen(false);
    if (!selectedStrategyId) return;
    const strat = (strategies ?? []).find((s) => s.id === selectedStrategyId);
    if (!strat) return;
    await apiFetch(`/strategies/${selectedStrategyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: strat.name,
        strategy_type: strat.strategy_type,
        code: strat.strategy_type === "code" ? code : "",
        filters: strat.strategy_type === "manual" ? filters : [],
        index_filter: selectedIndex,
        description: "",
      }),
    });
    showToast(`"${strat.name}" v${(strat.version || 1) + 1} updated`);
    refetchStrategies();
    fetchVersions(selectedStrategyId);
  }

  async function handleSaveNewVersion() {
    setUpdatePopupOpen(false);
    if (!selectedStrategyId) return;
    const strat = (strategies ?? []).find((s) => s.id === selectedStrategyId);
    if (!strat) return;
    const result = await apiPost<StoredStrategy>(`/strategies/${selectedStrategyId}/new-version`, {
      name: strat.name,
      strategy_type: strat.strategy_type,
      code: strat.strategy_type === "code" ? code : "",
      filters: strat.strategy_type === "manual" ? filters : [],
      index_filter: selectedIndex,
      description: "",
    });
    showToast(`"${strat.name}" v${result.version} saved`);
    setSelectedStrategyId(result.id);
    refetchStrategies();
    fetchVersions(result.id);
  }

  async function fetchVersions(stratId: string) {
    try {
      const data = await apiFetch<StoredStrategy[]>(`/strategies/${stratId}/versions`);
      setVersions(Array.isArray(data) ? data : []);
    } catch {
      setVersions([]);
    }
  }

  async function handleDeleteVersion() {
    if (!selectedStrategyId) return;
    const strat = (strategies ?? []).find((s) => s.id === selectedStrategyId);
    if (!strat) return;
    await apiFetch(`/strategies/${selectedStrategyId}`, { method: "DELETE" });
    showToast(`v${strat.version} deleted`);
    setConfirmDeleteVersion(false);
    const remaining = versions.filter((v) => v.id !== selectedStrategyId);
    if (remaining.length > 0) {
      const next = remaining[remaining.length - 1];
      setSelectedStrategyId(next.id);
      if (next.strategy_type === "code") setCode(next.code ?? "");
      setVersions(remaining);
    } else {
      setSelectedStrategyId(null);
      setCode("");
      setVersions([]);
    }
    refetchStrategies();
  }

  function handleVersionSwitch(versionId: string) {
    const ver = versions.find((v) => v.id === versionId);
    if (!ver) return;
    setSelectedStrategyId(versionId);
    if (ver.strategy_type === "code") {
      setCode(ver.code ?? "");
    } else if (ver.strategy_type === "manual") {
      const loadedFilters = ver.filters ?? [];
      setFilters(loadedFilters);
      setSelectedIds(new Set(loadedFilters.map((f) => f.id)));
      if (ver.index_filter) setSelectedIndex(ver.index_filter);
    }
  }

  function handleSelectStrategy(id: string) {
    const strat = (strategies ?? []).find((s) => s.id === id);
    if (!strat) return;
    setSelectedStrategyId(id);
    if (strat.strategy_type === "manual") {
      const loadedFilters = strat.filters ?? [];
      setFilters(loadedFilters);
      setSelectedIds(new Set(loadedFilters.map((f) => f.id)));
      if (strat.index_filter) setSelectedIndex(strat.index_filter);
    } else {
      setCode(strat.code ?? "");
    }
    fetchVersions(id);
  }

  async function handleDeleteStrategy(id: string) {
    await apiFetch(`/strategies/${id}`, { method: "DELETE" });
    if (selectedStrategyId === id) setSelectedStrategyId(null);
    refetchStrategies();
  }

  async function handleCreateFolder(name: string) {
    await apiPost("/strategy-folders", { name, context: "picker" });
    refetchFolders();
  }

  async function handleDeleteFolder(id: number) {
    await apiFetch(`/strategy-folders/${id}`, { method: "DELETE" });
    refetchFolders();
    refetchStrategies();
  }

  async function handleMoveStrategy(id: string, folderId: number | null, position: number) {
    await apiFetch(`/strategies/${id}/move`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_id: folderId, position }),
    });
    refetchStrategies();
  }

  async function handleReorderBar(items: { type: "strategy" | "folder"; id: number; position: number }[]) {
    await apiPost("/strategy-folders/reorder", { items });
    refetchStrategies();
    refetchFolders();
  }

  function switchChartView(mode: ChartViewMode) {
    setChartViewMode(mode);
    try { localStorage.setItem(CHART_VIEW_KEY, mode); } catch {}
  }

  const addMultiChart = useCallback((symbol: string, name?: string) => {
    setMultiCharts((prev) => {
      const existing = prev.find((c) => c.symbol === symbol);
      if (existing) {
        setHighlightChartId(existing.id);
        setTimeout(() => setHighlightChartId(null), 1500);
        const el = document.getElementById(`multi-chart-${existing.id}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        return prev;
      }
      const next = [...prev, { id: `${symbol}-${Date.now()}`, symbol, name }];
      saveMultiCharts(next);
      return next;
    });
  }, []);

  const removeMultiChart = useCallback((id: string) => {
    setMultiCharts((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveMultiCharts(next);
      return next;
    });
  }, []);

  const reorderMultiCharts = useCallback((next: MultiChartItem[]) => {
    setMultiCharts(next);
    saveMultiCharts(next);
  }, []);

  function handleStockClick(symbol: string, name?: string) {
    if (chartViewMode === "multi") {
      addMultiChart(symbol, name);
    } else {
      setChartStock({ symbol, name });
    }
  }

  const [sendingToAnalyzer, setSendingToAnalyzer] = useState(false);

  async function handleSendToAnalyzer() {
    if (results.length === 0) return;
    setSendingToAnalyzer(true);
    try {
      const stratName = selectedStrategy?.name ?? "Unnamed";
      await apiPost("/analyzer/stocks", {
        stocks: results.map((r) => ({
          symbol: r.symbol,
          name: r.name,
          price: r.price,
          matched_criteria: r.matched_criteria,
        })),
        strategy_name: stratName,
        strategy_type: selectedStrategy?.strategy_type ?? "manual",
        index_filter: selectedIndex,
        sector_filter: selectedSector,
      });
    } catch {
      // ignore
    }
    setSendingToAnalyzer(false);
  }

  const selectedStrategy = (strategies ?? []).find((s) => s.id === selectedStrategyId) ?? null;

  const barStrategies: BarStrategy[] = (strategies ?? [])
    .filter((s) => !s.parent_id)
    .map((s) => ({
      id: s.id,
      name: s.name,
      strategy_type: s.strategy_type,
      folder_id: s.folder_id ?? null,
      position: s.position ?? 0,
      version: s.version,
      version_count: s.version_count ?? 1,
      updated_at: s.updated_at,
    }));

  return (
    <div className="flex h-full flex-col">
      {toast && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
      <ResizableGroup direction="horizontal" className="h-full">
      {/* Left: Saved Strategies + Indicator Filters + Stock Table */}
      <Panel defaultSize={18} minSize={12} maxSize={30}>
        <div className="flex h-full flex-col">
          <ResizableGroup direction="vertical" className="h-full">
            <Panel defaultSize={20} minSize={8} maxSize={50} className="border-r border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="h-full">
                <StrategyBookmarksBar
                  strategies={barStrategies}
                  folders={folders ?? []}
                  selectedId={selectedStrategyId}
                  onSelect={handleSelectStrategy}
                  onDelete={handleDeleteStrategy}
                  onCreateFolder={handleCreateFolder}
                  onDeleteFolder={handleDeleteFolder}
                  onMoveStrategy={handleMoveStrategy}
                  onReorder={handleReorderBar}
                />
              </div>
            </Panel>
            <ResizeHandle />
              <Panel defaultSize={35} minSize={15} className="border-r border-slate-200 p-2.5 dark:border-slate-800">
                <IndicatorBrowser
                  filters={filters}
                  onFiltersChange={handleFiltersChange}
                  onOpenCatalog={() => setCatalogOpen(true)}
                  onRun={handleManualRun}
                  onSave={() => setSaveModalType("manual")}
                  onUpdate={handleUpdateClick}
                  canUpdate={selectedStrategy?.strategy_type === "manual"}
                  running={runStatus === "running"}
                />
              </Panel>
              <ResizeHandle />
              <Panel defaultSize={45} minSize={15} className="border-r border-slate-200 p-2.5 dark:border-slate-800">
                <StockScreener
                  onStockClick={(sym, name) => handleStockClick(sym, name)}
                  index={selectedIndex}
                  onIndexChange={setSelectedIndex}
                  sector={selectedSector}
                  onSectorChange={setSelectedSector}
                />
              </Panel>
            </ResizableGroup>
        </div>
      </Panel>
      <ResizeHandle />

      {/* Center: Code/Chart + Results */}
      <Panel defaultSize={52} minSize={30}>
        <ResizableGroup direction="vertical" className="h-full">
          {/* Top: Code (collapsible left) + Chart side-by-side */}
          <Panel defaultSize={40} minSize={15}>
            <ResizableGroup direction="horizontal" className="h-full">
              <Panel
                ref={codePanelRef}
                defaultSize={50}
                minSize={15}
                collapsible
                collapsedSize={3}
                onCollapse={() => setCodePanelCollapsed(true)}
                onExpand={() => setCodePanelCollapsed(false)}
              >
                {codePanelCollapsed ? (
                  <div className="flex h-full items-center justify-center border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
                    <button
                      onClick={() => codePanelRef.current?.expand()}
                      className="flex flex-col items-center gap-1 rounded px-1 py-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                      title="Show generated code"
                    >
                      <Code2 size={13} />
                      <PanelLeftOpen size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-full flex-col overflow-hidden p-3">
                    <div className="mb-2 flex shrink-0 items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => codePanelRef.current?.collapse()}
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                          title="Collapse code panel"
                        >
                          <PanelLeftClose size={13} />
                        </button>
                        <SectionLabel>Generated Code</SectionLabel>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedStrategy && versions.length > 1 && (
                          <select
                            value={selectedStrategyId ?? ""}
                            onChange={(e) => handleVersionSwitch(e.target.value)}
                            className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            {versions.map((v) => (
                              <option key={v.id} value={v.id}>v{v.version}</option>
                            ))}
                          </select>
                        )}
                        {selectedStrategy && versions.length <= 1 && selectedStrategy.version > 0 && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            v{selectedStrategy.version}
                          </span>
                        )}
                        {selectedStrategy && (
                          <button
                            onClick={() => setConfirmDeleteVersion(true)}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950 dark:hover:text-red-400"
                            title={`Delete v${selectedStrategy.version}`}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                        {selectedStrategy?.strategy_type === "code" && (
                          <div className="relative" ref={updatePopupRef}>
                            <button
                              onClick={handleUpdateClick}
                              disabled={!code}
                              className="flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                              title="Save changes to the loaded strategy"
                            >
                              <Check size={13} />
                              Update
                            </button>
                            {updatePopupOpen && (
                              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                                <button
                                  onClick={handleUpdateSameVersion}
                                  className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                                >
                                  Update v{selectedStrategy.version}
                                </button>
                                <button
                                  onClick={handleSaveNewVersion}
                                  className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                                >
                                  Save as v{(selectedStrategy.version || 1) + 1}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        <SaveStrategyButton disabled={!code} onSave={() => setSaveModalType("code")} label="Save" />
                      </div>
                    </div>
                    <textarea
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder={"# No strategy code yet.\n# Describe a picking strategy in the chat to get started."}
                      spellCheck={false}
                      className="min-h-0 flex-1 resize-none rounded-md border border-slate-200 bg-slate-950 p-3 font-mono text-sm leading-relaxed text-emerald-400 outline-none placeholder:text-slate-600 dark:border-slate-800"
                    />
                  </div>
                )}
              </Panel>
              <ResizeHandle />
              <Panel defaultSize={50} minSize={25}>
                <div className="flex h-full flex-col">
                  {/* Chart view toggle */}
                  <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-2 py-1 dark:border-slate-800">
                    <div className="flex items-center rounded-md border border-slate-200 dark:border-slate-700">
                      <button
                        onClick={() => switchChartView("single")}
                        className={cn(
                          "flex items-center gap-1 rounded-l-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                          chartViewMode === "single"
                            ? "bg-indigo-600 text-white"
                            : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                        )}
                      >
                        <Monitor size={10} />
                        Single
                      </button>
                      <button
                        onClick={() => switchChartView("multi")}
                        className={cn(
                          "flex items-center gap-1 rounded-r-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                          chartViewMode === "multi"
                            ? "bg-indigo-600 text-white"
                            : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                        )}
                      >
                        <LayoutGrid size={10} />
                        Multi
                        {multiCharts.length > 0 && (
                          <span className="rounded-full bg-slate-200 px-1 text-[8px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            {multiCharts.length}
                          </span>
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {(chartViewMode === "single" ? chartStock : multiCharts.length > 0) && (
                        <>
                          <button
                            onClick={() => {
                              window.dispatchEvent(new Event("resize"));
                              setTimeout(() => window.dispatchEvent(new Event("chart-refit")), 100);
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                            title="Refit all charts"
                          >
                            <RefreshCw size={12} />
                          </button>
                          <button
                            onClick={() => {
                              if (chartViewMode === "single") {
                                setChartStock(null);
                              } else {
                                setMultiCharts([]);
                                saveMultiCharts([]);
                              }
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950 dark:hover:text-red-400"
                            title={chartViewMode === "single" ? "Clear chart" : "Clear all charts"}
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Chart content */}
                  <div className="min-h-0 flex-1">
                    {chartViewMode === "single" ? (
                      chartStock ? (
                        <ResizableGroup direction="vertical">
                          <Panel defaultSize={65} minSize={30}>
                            <div className="flex h-full flex-col">
                              <StockChartPanel
                                symbol={chartStock.symbol}
                                name={chartStock.name}
                                onClose={() => setChartStock(null)}
                              />
                            </div>
                          </Panel>
                          <ResizeHandle />
                          <Panel
                            ref={tickerPanelRef}
                            defaultSize={35}
                            minSize={10}
                            collapsible
                            collapsedSize={3}
                            onCollapse={() => setTickerCollapsed(true)}
                            onExpand={() => setTickerCollapsed(false)}
                          >
                            {tickerCollapsed ? (
                              <div className="flex h-full items-center justify-center border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
                                <button
                                  onClick={() => tickerPanelRef.current?.expand()}
                                  className="flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                                  title="Show live ticker"
                                >
                                  <ChevronsUp size={12} />
                                  <Activity size={10} />
                                  Live Ticker
                                </button>
                              </div>
                            ) : (
                              <div className="flex h-full flex-col">
                                <div className="flex shrink-0 items-center justify-end border-t border-slate-200 px-1 dark:border-slate-800">
                                  <button
                                    onClick={() => tickerPanelRef.current?.collapse()}
                                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                                    title="Collapse ticker"
                                  >
                                    <ChevronsDown size={12} />
                                  </button>
                                </div>
                                <div className="min-h-0 flex-1">
                                  <LiveTickerTable symbol={chartStock.symbol} />
                                </div>
                              </div>
                            )}
                          </Panel>
                        </ResizableGroup>
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">
                          Click a stock to view its chart
                        </div>
                      )
                    ) : (
                      <MultiChartGrid
                        charts={multiCharts}
                        onRemove={removeMultiChart}
                        onReorder={reorderMultiCharts}
                        highlightId={highlightChartId}
                      />
                    )}
                  </div>
                </div>
              </Panel>
            </ResizableGroup>
          </Panel>
          <ResizeHandle />

          <Panel defaultSize={60} minSize={20} className="flex min-h-0 flex-col p-3">
            <div className="mb-2 flex shrink-0 items-center justify-between">
              <SectionLabel>Results ({results.length} stocks)</SectionLabel>
              <div className="flex items-center gap-2">
                {results.length > 0 && (
                  <>
                    <button
                      onClick={handleSendToAnalyzer}
                      disabled={sendingToAnalyzer}
                      className="flex items-center gap-1 rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-400 dark:hover:bg-indigo-950"
                      title="Send picked stocks to the Analyzer tab"
                    >
                      <Send size={11} />
                      {sendingToAnalyzer ? "Sending..." : "Send to Analyzer"}
                    </button>
                    <button
                      onClick={() => setResults([])}
                      className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[10px] font-medium text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-red-950 dark:hover:text-red-400"
                      title="Clear results"
                    >
                      <Trash2 size={11} />
                      Clear
                    </button>
                  </>
                )}
                <span className="text-[10px] text-slate-400">Code Run</span>
                <RunControls status={runStatus} onRun={handleCodeRun} onStop={() => setRunStatus("idle")} onRerun={handleCodeRun} />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-3 py-2">Symbol</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2">Matched Criteria</th>
                    <th className="px-3 py-2">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {results.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No results yet. Use "Run" on your filters, or "Run Code" once the AI generates a strategy.</td></tr>
                  ) : (
                    results.map((r, idx) => (
                      <tr
                        key={`${r.symbol}-${idx}`}
                        onClick={() => handleStockClick(r.symbol, r.name)}
                        className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900"
                      >
                        <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{r.symbol}</td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.name}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-200">₹{r.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.matched_criteria}</td>
                        <td className="px-3 py-2 text-xs text-slate-400">{new Date(r.timestamp).toLocaleTimeString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </ResizableGroup>
      </Panel>

      <CollapsibleChatPanel
        title="Stock Picker AI"
        placeholder="e.g. Pick stocks with strong momentum and rising volume..."
        tab="picker"
        onCodeGenerated={setCode}
      />
      </ResizableGroup>

      <IndicatorCatalogModal
        open={catalogOpen}
        onClose={handleCatalogClose}
        selected={selectedIds}
        onSelectionChange={setSelectedIds}
      />

      <SaveStrategyModal
        open={saveModalType !== null}
        strategyType={saveModalType}
        folders={folders ?? []}
        onClose={() => setSaveModalType(null)}
        onSave={handleSaveStrategy}
      />

      {confirmDeleteVersion && selectedStrategy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmDeleteVersion(false)}>
          <div
            className="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Delete v{selectedStrategy.version}?
            </h3>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              This will permanently delete version {selectedStrategy.version} of &ldquo;{selectedStrategy.name}&rdquo;.
              {versions.length <= 1 && " This is the only version — the strategy will be removed entirely."}
              {" "}This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteVersion(false)}
                className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteVersion}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
