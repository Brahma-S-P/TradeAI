import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Trash2, RefreshCw, Monitor, LayoutGrid, Calendar } from "lucide-react";
import { ResizableGroup, Panel, ResizeHandle } from "@/components/panels/ResizablePanel";
import { CollapsibleChatPanel } from "@/components/panels/CollapsibleChatPanel";
import { CollapsibleCodePanel, type BuilderMode } from "@/components/panels/CollapsibleCodePanel";
import type { ConditionTree } from "@/components/panels/VisualStrategyBuilder";
import { StrategyBookmarksBar, type BarStrategy, type BarFolder } from "@/components/panels/StrategyBookmarksBar";
import { SaveStrategyModal, type FolderChoice } from "@/components/panels/SaveStrategyModal";

import { RunGroupSelector } from "@/components/panels/RunGroupSelector";
import { RunStrategyModal, type RunConfig } from "@/components/panels/RunStrategyModal";
import { AnalyzerStocksPanel, type AnalyzerStockItem, type AnalyzerRunGroup, type AnalyzerFolderItem } from "@/components/panels/AnalyzerStocksPanel";
import { SectionLabel } from "@/components/panels/SectionLabel";
import { EmptyState } from "@/components/panels/EmptyState";
import { IndicatorControls } from "@/components/panels/IndicatorControls";
import { AnalyzerTabs } from "@/components/panels/AnalyzerTabs";
import { SessionManager } from "@/components/panels/SessionManager";
import { StockChartPanel, type SignalResult as ChartSignal } from "@/components/panels/StockChartPanel";
import { MultiChartGrid, type MultiChartItem } from "@/components/panels/MultiChartGrid";
import { type SignalResult } from "@/components/panels/SignalsPanel";

interface StrategyRunResponse {
  signals: SignalResult[];
  trade_markers: Record<string, ChartSignal[]>;
}
import { useApi } from "@/lib/useApi";
import { apiFetch, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";

type ChartViewMode = "single" | "multi";
type DatePreset = "1W" | "1M" | "3M" | "6M" | "1Y" | "custom";

const ANALYZER_MULTI_CHARTS_KEY = "analyzer-multi-charts";
const ANALYZER_CHART_VIEW_KEY = "analyzer-chart-view";

function loadAnalyzerMultiCharts(): MultiChartItem[] {
  try {
    const raw = localStorage.getItem(ANALYZER_MULTI_CHARTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAnalyzerMultiCharts(charts: MultiChartItem[]) {
  try { localStorage.setItem(ANALYZER_MULTI_CHARTS_KEY, JSON.stringify(charts)); } catch {}
}

function loadAnalyzerChartView(): ChartViewMode {
  try {
    const v = localStorage.getItem(ANALYZER_CHART_VIEW_KEY);
    return v === "multi" ? "multi" : "single";
  } catch { return "single"; }
}

function dateFromPreset(preset: DatePreset): string {
  const d = new Date();
  switch (preset) {
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

interface AnalyzerStock {
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

interface RunGroup {
  run_id: string;
  strategy_name: string;
  strategy_type: string;
  index_filter: string;
  sector_filter: string;
  created_at: string | null;
  folder_id: number | null;
  position: number;
  stocks: AnalyzerStock[];
}

interface StoredStrategy {
  id: string;
  name: string;
  version: number;
  strategy_type: string;
  updated_at: string;
  code: string;
  folder_id?: number | null;
  position?: number;
}

export function StockAnalyzer() {
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>("");
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const symbolsHistory = useRef<string[][]>([[]]);
  const historyIndex = useRef(0);
  const [, forceRender] = useState(0);
  const [stocks, setStocks] = useState<AnalyzerStock[]>([]);
  const [loading, setLoading] = useState(false);

  // Strategy builder state
  const [code, setCode] = useState("");
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "completed" | "error">("idle");
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [signalResults, setSignalResults] = useState<SignalResult[]>([]);
  const [tradeMarkers, setTradeMarkers] = useState<Record<string, ChartSignal[]>>({});
  const [builderMode, setBuilderMode] = useState<BuilderMode>("code");
  const [conditions, setConditions] = useState<ConditionTree>({
    entry: [{ indicator: "rsi_14", operator: "<", value: 30 }],
    exit: [{ indicator: "rsi_14", operator: ">", value: 70 }],
    risk: { stop_loss_pct: 3, target_pct: 6, trailing_stop: false },
  });
  const [visualRunning, setVisualRunning] = useState(false);
  const [codeRunSelectorOpen, setCodeRunSelectorOpen] = useState(false);
  const [visualRunSelectorOpen, setVisualRunSelectorOpen] = useState(false);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const { data: strategies, refetch: refetchStrategies } = useApi<StoredStrategy[]>("/strategies?context=analyzer");
  const { data: folders, refetch: refetchFolders } = useApi<BarFolder[]>("/strategy-folders?context=analyzer");

  // Analyzer folders (for stock run organization)
  const { data: analyzerFolders, refetch: refetchAnalyzerFolders } = useApi<AnalyzerFolderItem[]>("/analyzer-folders");

  // All stocks from universe (for search in RunStrategyModal)
  const { data: universeStocks } = useApi<{ symbol: string; name: string }[]>("/stocks/universe");
  const allStocksForModal = useMemo(
    () => (universeStocks ?? []).map((s) => ({ symbol: s.symbol, name: s.name })),
    [universeStocks],
  );

  // Multi-chart state
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>(loadAnalyzerChartView);
  const [multiCharts, setMultiCharts] = useState<MultiChartItem[]>(loadAnalyzerMultiCharts);
  const [highlightChartId, setHighlightChartId] = useState<string | null>(null);

  // Date range state
  const [datePreset, setDatePreset] = useState<DatePreset>("3M");
  const [dateFrom, setDateFrom] = useState(dateFromPreset("3M"));
  const [dateTo, setDateTo] = useState(todayStr());

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<AnalyzerStock[]>("/analyzer/stocks");
      setStocks(data);
    } catch {
      setStocks([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchStocks(); }, [fetchStocks]);

  const runs = useMemo(() => {
    const map = new Map<string, RunGroup>();
    for (const s of stocks) {
      if (!map.has(s.run_id)) {
        map.set(s.run_id, {
          run_id: s.run_id,
          strategy_name: s.strategy_name,
          strategy_type: s.strategy_type,
          index_filter: s.index_filter,
          sector_filter: s.sector_filter,
          created_at: s.created_at,
          folder_id: s.folder_id,
          position: s.position,
          stocks: [],
        });
      }
      map.get(s.run_id)!.stocks.push(s);
    }
    return [...map.values()];
  }, [stocks]);

  const runGroupOptions = useMemo(
    () =>
      runs.map((r) => ({
        run_id: r.run_id,
        strategy_name: r.strategy_name,
        strategy_type: r.strategy_type,
        stock_count: r.stocks.length,
      })),
    [runs],
  );

  function symbolsForRun(runId: string): string[] {
    const group = runs.find((r) => r.run_id === runId);
    return group ? group.stocks.map((s) => s.symbol) : [];
  }

  // --- Symbol selection with undo/redo ---
  function pushSymbols(next: string[]) {
    const h = symbolsHistory.current;
    symbolsHistory.current = [...h.slice(0, historyIndex.current + 1), next];
    historyIndex.current = symbolsHistory.current.length - 1;
    setSelectedSymbols(next);
    forceRender((n) => n + 1);
  }

  function selectStock(symbol: string, name: string) {
    setSelectedSymbol(symbol);
    setSelectedName(name);
    if (chartViewMode === "multi") {
      addMultiChart(symbol, name);
    }
    const next = selectedSymbols.includes(symbol)
      ? selectedSymbols.filter((s) => s !== symbol)
      : [...selectedSymbols, symbol];
    pushSymbols(next);
  }

  function undoSymbols() {
    if (historyIndex.current <= 0) return;
    historyIndex.current--;
    setSelectedSymbols(symbolsHistory.current[historyIndex.current]);
    forceRender((n) => n + 1);
  }

  function redoSymbols() {
    if (historyIndex.current >= symbolsHistory.current.length - 1) return;
    historyIndex.current++;
    setSelectedSymbols(symbolsHistory.current[historyIndex.current]);
    forceRender((n) => n + 1);
  }

  function clearSymbols() {
    pushSymbols([]);
  }

  function toggleIndicator(key: string) {
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // --- Multi-chart helpers ---
  function switchChartView(mode: ChartViewMode) {
    setChartViewMode(mode);
    try { localStorage.setItem(ANALYZER_CHART_VIEW_KEY, mode); } catch {}
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
      saveAnalyzerMultiCharts(next);
      return next;
    });
  }, []);

  const removeMultiChart = useCallback((id: string) => {
    setMultiCharts((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveAnalyzerMultiCharts(next);
      return next;
    });
  }, []);

  const reorderMultiCharts = useCallback((next: MultiChartItem[]) => {
    setMultiCharts(next);
    saveAnalyzerMultiCharts(next);
  }, []);

  function handleDatePresetChange(preset: DatePreset) {
    setDatePreset(preset);
    if (preset !== "custom") {
      setDateFrom(dateFromPreset(preset));
      setDateTo(todayStr());
      window.dispatchEvent(new CustomEvent("chart-set-timerange", { detail: preset }));
    }
  }

  // --- Stock CRUD ---
  async function deleteRun(runId: string) {
    await apiFetch(`/analyzer/stocks/run/${runId}`, { method: "DELETE" });
    fetchStocks();
    if (stocks.some((s) => s.run_id === runId && s.symbol === selectedSymbol)) {
      setSelectedSymbol(null);
    }
  }

  async function deleteStock(id: number, symbol: string) {
    await apiFetch(`/analyzer/stocks/${id}`, { method: "DELETE" });
    fetchStocks();
    if (symbol === selectedSymbol) {
      setSelectedSymbol(null);
    }
  }

  // --- Strategy builder handlers ---
  function handleCodeRun() {
    setRunModalOpen(true);
  }

  async function executeRunWithConfig(config: RunConfig) {
    const { symbols, dateFrom: df, dateTo: dt, interval: iv, initialCapital: cap, maxTradesPerDay: mtpd, positionSizePct: psp, mode } = config;
    const params = { date_from: df, date_to: dt, interval: iv, initial_capital: cap, max_trades_per_day: mtpd, position_size_pct: psp };
    if (mode === "visual") {
      setVisualRunning(true);
      try {
        const data = await apiPost<StrategyRunResponse | { error: string }>("/analyzer/run/visual", {
          conditions, symbols, ...params,
        });
        if ("signals" in data) {
          setSignalResults(data.signals);
          setTradeMarkers(data.trade_markers ?? {});
        } else {
          setSignalResults([]);
          setTradeMarkers({});
        }
      } catch {
        setSignalResults([]);
        setTradeMarkers({});
      }
      setVisualRunning(false);
    } else {
      setRunStatus("running");
      try {
        const data = await apiPost<StrategyRunResponse | { error: string }>("/analyzer/run/code", {
          code, symbols, ...params,
        });
        if ("signals" in data) {
          setSignalResults(data.signals);
          setTradeMarkers(data.trade_markers ?? {});
          setRunStatus("completed");
        } else {
          setSignalResults([]);
          setTradeMarkers({});
          setRunStatus("error");
        }
      } catch {
        setSignalResults([]);
        setTradeMarkers({});
        setRunStatus("error");
      }
    }
  }

  async function executeCodeRun(runId: string) {
    setCodeRunSelectorOpen(false);
    const symbols = symbolsForRun(runId);
    if (symbols.length === 0) return;
    setRunStatus("running");
    try {
      const data = await apiPost<StrategyRunResponse | { error: string }>("/analyzer/run/code", { code, symbols });
      if ("signals" in data) {
        setSignalResults(data.signals);
        setTradeMarkers(data.trade_markers ?? {});
        setRunStatus("completed");
      } else {
        setSignalResults([]);
        setTradeMarkers({});
        setRunStatus("error");
      }
    } catch {
      setSignalResults([]);
      setTradeMarkers({});
      setRunStatus("error");
    }
  }

  function handleRunVisual() {
    setRunModalOpen(true);
  }

  async function executeVisualRun(runId: string) {
    setVisualRunSelectorOpen(false);
    const symbols = symbolsForRun(runId);
    if (symbols.length === 0) return;
    setVisualRunning(true);
    try {
      const data = await apiPost<StrategyRunResponse | { error: string }>("/analyzer/run/visual", {
        conditions,
        symbols,
      });
      if ("signals" in data) {
        setSignalResults(data.signals);
        setTradeMarkers(data.trade_markers ?? {});
      } else {
        setSignalResults([]);
        setTradeMarkers({});
      }
    } catch {
      setSignalResults([]);
      setTradeMarkers({});
    }
    setVisualRunning(false);
  }

  function handleSelectStrategy(id: string) {
    const strat = (strategies ?? []).find((s) => s.id === id);
    if (!strat) return;
    setSelectedStrategyId(id);
    setCode(strat.code ?? "");
  }

  async function handleSaveStrategy(name: string, folder: FolderChoice) {
    setSaveModalOpen(false);

    let folderId: number;
    if ("newFolderName" in folder) {
      const created = await apiPost<BarFolder>("/strategy-folders", { name: folder.newFolderName, context: "analyzer" });
      folderId = created.id;
    } else {
      folderId = folder.folderId;
    }

    await apiPost("/strategies", {
      name,
      strategy_type: "analyzer_code",
      code,
      filters: [],
      index_filter: "",
      description: "",
      folder_id: folderId,
    });
    refetchStrategies();
    refetchFolders();
  }

  async function handleUpdateStrategy() {
    if (!selectedStrategyId) return;
    const strat = (strategies ?? []).find((s) => s.id === selectedStrategyId);
    if (!strat) return;
    await apiFetch(`/strategies/${selectedStrategyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: strat.name,
        strategy_type: "analyzer_code",
        code,
        filters: [],
        index_filter: "",
        description: "",
      }),
    });
    refetchStrategies();
  }

  async function handleDeleteStrategy(id: string) {
    await apiFetch(`/strategies/${id}`, { method: "DELETE" });
    if (selectedStrategyId === id) setSelectedStrategyId(null);
    refetchStrategies();
  }

  async function handleCreateFolder(name: string) {
    await apiPost("/strategy-folders", { name, context: "analyzer" });
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

  // --- Analyzer folder handlers ---
  async function handleCreateAnalyzerFolder(name: string) {
    await apiPost("/analyzer-folders", { name });
    refetchAnalyzerFolders();
  }

  async function handleDeleteAnalyzerFolder(id: number, deleteBatches: boolean) {
    await apiFetch(`/analyzer-folders/${id}?delete_batches=${deleteBatches}`, { method: "DELETE" });
    refetchAnalyzerFolders();
    fetchStocks();
  }

  async function handleRenameAnalyzerFolder(id: number, name: string) {
    await apiFetch(`/analyzer-folders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    refetchAnalyzerFolders();
  }

  async function handleMoveRun(runId: string, folderId: number | null, position: number) {
    await apiFetch(`/analyzer-folders/run/${runId}/move`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_id: folderId, position }),
    });
    fetchStocks();
  }

  async function handleReorderAnalyzer(items: { type: string; id: string; position: number }[]) {
    await apiPost("/analyzer-folders/reorder", { items });
    refetchAnalyzerFolders();
    fetchStocks();
  }

  function handleSignalSelectStock(symbol: string) {
    const stock = stocks.find((s) => s.symbol === symbol);
    setSelectedSymbol(symbol);
    setSelectedName(stock?.name ?? symbol);
  }

  const [summarizeTrigger, setSummarizeTrigger] = useState(0);

  const analyzerContext = useMemo(() => ({
    selected_symbol: selectedSymbol,
    selected_stocks: stocks.map(s => s.symbol),
    active_indicators: Array.from(activeIndicators),
    signal_results: signalResults.map(s => ({
      symbol: s.symbol,
      signal: s.signal.toUpperCase(),
      reason: s.reason,
      entry_price: s.entry_price,
      stop_loss: s.stop_loss,
      target: s.target,
    })),
    code: code || undefined,
  }), [selectedSymbol, stocks, activeIndicators, signalResults, code]);

  const selectedStrategy = (strategies ?? []).find((s) => s.id === selectedStrategyId) ?? null;

  const barStrategies: BarStrategy[] = (strategies ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    strategy_type: s.strategy_type,
    folder_id: s.folder_id ?? null,
    position: s.position ?? 0,
    version: s.version,
    updated_at: s.updated_at,
  }));

  function handleLoadSession(session: any) {
    if (session.symbol) {
      setSelectedSymbol(session.symbol);
    }
    if (session.notes) setNotes(session.notes);
    if (session.code) setCode(session.code);
    if (session.builder_mode) setBuilderMode(session.builder_mode as any);
    if (session.conditions && Object.keys(session.conditions).length > 0) {
      setConditions(session.conditions as ConditionTree);
    }
    if (session.indicator_state) {
      setActiveIndicators(new Set(session.indicator_state));
    }
  }

  const signalMap = useMemo(() => {
    const map = new Map<string, SignalResult>();
    for (const s of signalResults) map.set(s.symbol, s);
    return map;
  }, [signalResults]);

  return (
    <div className="flex h-full flex-col">
    <ResizableGroup direction="horizontal" className="h-full">
      {/* Left Sidebar — Strategies + Code + Stock List */}
      <Panel defaultSize={22} minSize={14} maxSize={35} className="border-r border-slate-200 dark:border-slate-800">
        <ResizableGroup direction="vertical" className="h-full">
          {/* Strategy Bookmarks Bar */}
          <Panel defaultSize={15} minSize={8} maxSize={40} className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
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

          {/* Collapsible Code Editor */}
          <CollapsibleCodePanel
            code={code}
            onCodeChange={setCode}
            onRun={handleCodeRun}
            onSave={() => setSaveModalOpen(true)}
            onUpdate={handleUpdateStrategy}
            canUpdate={selectedStrategy?.strategy_type === "analyzer_code"}
            runStatus={runStatus}
            defaultSize={35}
            minSize={10}
            builderMode={builderMode}
            onBuilderModeChange={setBuilderMode}
            conditions={conditions}
            onConditionsChange={setConditions}
            onRunVisual={handleRunVisual}
            visualRunning={visualRunning}
          />

          <ResizeHandle />

          {/* Analyzer Stocks */}
          <Panel defaultSize={50} minSize={15} className="flex flex-col">
            <div className="flex items-center justify-between px-3 pt-2 pb-1.5">
              <SectionLabel>Analyzer Stocks</SectionLabel>
              <button onClick={fetchStocks} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-900" title="Refresh">
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
            <AnalyzerStocksPanel
              runs={runs as AnalyzerRunGroup[]}
              folders={analyzerFolders ?? []}
              selectedSymbol={selectedSymbol}
              signalMap={signalMap}
              onSelectStock={selectStock}
              onDeleteStock={deleteStock}
              onDeleteRun={deleteRun}
              onCreateFolder={handleCreateAnalyzerFolder}
              onDeleteFolder={handleDeleteAnalyzerFolder}
              onRenameFolder={handleRenameAnalyzerFolder}
              onMoveRun={handleMoveRun}
              onReorder={handleReorderAnalyzer}
            />
          </Panel>
        </ResizableGroup>
      </Panel>
      <ResizeHandle />

      {/* Center — Chart + Tabbed Analysis */}
      <Panel defaultSize={48} minSize={30}>
        <ResizableGroup direction="vertical" className="h-full">
          {/* Chart Area */}
          <Panel defaultSize={60} minSize={30} className="flex flex-col overflow-hidden">
            {/* Chart header: view toggle + date range + controls */}
            <div className="flex items-center justify-between border-b border-slate-200 px-2 py-1 dark:border-slate-800">
              <div className="flex items-center gap-3">
                {/* Single / Multi toggle */}
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

                {/* Date range picker */}
                <div className="flex items-center gap-1">
                  <Calendar size={10} className="text-slate-400" />
                  {(["1W", "1M", "3M", "6M", "1Y"] as DatePreset[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => handleDatePresetChange(p)}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                        datePreset === p
                          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                          : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => handleDatePresetChange("custom")}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                      datePreset === "custom"
                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                        : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    Custom
                  </button>
                  {datePreset === "custom" && (
                    <>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      />
                      <span className="text-[10px] text-slate-400">to</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {(chartViewMode === "single" ? selectedSymbol : multiCharts.length > 0) && (
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
                          setSelectedSymbol(null);
                        } else {
                          setMultiCharts([]);
                          saveAnalyzerMultiCharts([]);
                        }
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950 dark:hover:text-red-400"
                      title={chartViewMode === "single" ? "Clear chart" : "Clear all charts"}
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
                <SessionManager
                  currentState={{
                    symbol: selectedSymbol,
                    notes,
                    indicators: Array.from(activeIndicators),
                    code,
                    builderMode,
                    conditions: conditions as Record<string, unknown>,
                    selectedSymbols,
                  }}
                  onLoad={handleLoadSession}
                />
              </div>
            </div>

            {/* Chart content */}
            <div className="min-h-0 flex-1">
              {chartViewMode === "single" ? (
                selectedSymbol ? (
                  <div className="flex h-full flex-col">
                    <div className="shrink-0 border-b border-slate-200 px-2 py-0.5 dark:border-slate-800">
                      <IndicatorControls active={activeIndicators} onToggle={toggleIndicator} />
                    </div>
                    <div className="min-h-0 flex-1">
                      <StockChartPanel
                        symbol={selectedSymbol}
                        name={selectedName}
                        indicators={activeIndicators}
                        signals={tradeMarkers[selectedSymbol] ?? tradeMarkers[selectedSymbol.toUpperCase()]}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <EmptyState text="Select a stock to view its chart." />
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
          </Panel>
          <ResizeHandle />

          {/* Tabbed Lower Panel */}
          <Panel defaultSize={40} minSize={20} className="overflow-hidden">
            <AnalyzerTabs
              selectedSymbol={selectedSymbol}
              selectedSymbols={selectedSymbols}
              notes={notes}
              onNotesChange={setNotes}
              onClearSymbols={clearSymbols}
              onUndoSymbols={undoSymbols}
              onRedoSymbols={redoSymbols}
              canUndo={historyIndex.current > 0}
              canRedo={historyIndex.current < symbolsHistory.current.length - 1}
              signalResults={signalResults}
              onSignalSelectStock={handleSignalSelectStock}
              code={code}
              onSummarize={() => setSummarizeTrigger((n) => n + 1)}
            />
          </Panel>
        </ResizableGroup>
      </Panel>

      {/* Right — AI Chat */}
      <CollapsibleChatPanel
        title="Stock Analyzer AI"
        placeholder="e.g. Analyze these stocks, generate signals, summarize results..."
        tab="analyzer"
        onCodeGenerated={setCode}
        onConditionsGenerated={(c) => {
          setConditions(c as ConditionTree);
          setBuilderMode("visual");
        }}
        analyzerContext={analyzerContext}
        summarizeTrigger={summarizeTrigger}
      />

    </ResizableGroup>

    <SaveStrategyModal
      open={saveModalOpen}
      strategyType="analyzer_code"
      folders={folders ?? []}
      onClose={() => setSaveModalOpen(false)}
      onSave={handleSaveStrategy}
    />

    <RunGroupSelector
      open={codeRunSelectorOpen}
      title="Run Code Strategy"
      runGroups={runGroupOptions}
      onClose={() => setCodeRunSelectorOpen(false)}
      onSelect={executeCodeRun}
    />

    <RunGroupSelector
      open={visualRunSelectorOpen}
      title="Run Visual Strategy"
      runGroups={runGroupOptions}
      onClose={() => setVisualRunSelectorOpen(false)}
      onSelect={executeVisualRun}
    />

    <RunStrategyModal
      open={runModalOpen}
      onClose={() => setRunModalOpen(false)}
      onRun={executeRunWithConfig}
      singleChartSymbol={selectedSymbol}
      chartedSymbols={multiCharts.map((c) => ({ symbol: c.symbol, name: c.name ?? c.symbol }))}
      listStocks={stocks.map((s) => ({ symbol: s.symbol, name: s.name }))}
      allStocks={allStocksForModal}
      builderMode={builderMode}
      hasCode={!!code.trim()}
    />
    </div>
  );
}
