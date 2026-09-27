import { useState, useMemo, useCallback, useRef } from "react";
import {
  Play, Loader2, Trash2, ChevronDown, Search, Plus, X,
  TrendingUp, TrendingDown, History, Settings2, BarChart3,
  Clock, DollarSign, Target, Shield, Layers, Code2, ChevronRight,
  FileCode, PackageOpen,
} from "lucide-react";
import { ResizableGroup, Panel, ResizeHandle } from "@/components/panels/ResizablePanel";
import { CollapsibleChatPanel } from "@/components/panels/CollapsibleChatPanel";
import { BacktestResultsPanel, type BacktestResult } from "@/components/panels/BacktestResultsPanel";
import { useApi } from "@/lib/useApi";
import { apiFetch, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";

interface Strategy {
  id: string;
  name: string;
  code: string;
  strategy_type: string;
  version: number;
}

interface RunListItem {
  id: number;
  strategy_id: number;
  start_date: string;
  end_date: string;
  initial_capital: number;
  total_return: number;
  win_rate: number;
  max_drawdown: number;
  sharpe_ratio: number;
  total_trades: number;
  profit_factor: number;
  sortino_ratio: number;
  status: string;
  symbols: string[];
  created_at: string | null;
}

interface FullRun {
  id: number;
  strategy_id: number;
  start_date: string;
  end_date: string;
  initial_capital: number;
  status: string;
  symbols: string[];
  strategy_code: string;
  created_at: string | null;
  metrics: Record<string, number>;
  trades: BacktestResult["trades"];
  equity_curve: BacktestResult["equity_curve"];
  benchmark_curve?: BacktestResult["benchmark_curve"];
  drawdown_curve?: BacktestResult["drawdown_curve"];
  monthly_returns?: BacktestResult["monthly_returns"];
  signals_by_date: Record<string, unknown[]>;
}

type StockSource = "strategy" | "custom";

export function Backtesting() {
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "completed" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<BacktestResult | null>(null);

  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [stockSource, setStockSource] = useState<StockSource>("strategy");
  const [customSymbols, setCustomSymbols] = useState("");
  const [symbolSearch, setSymbolSearch] = useState("");

  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-08-01");
  const [capital, setCapital] = useState(100000);
  const [stopLoss, setStopLoss] = useState(5);
  const [targetPct, setTargetPct] = useState(10);
  const [maxPositions, setMaxPositions] = useState(10);
  const [trailingStop, setTrailingStop] = useState(0);
  const [slippageBps, setSlippageBps] = useState(5);
  const [commissionPct, setCommissionPct] = useState(0.03);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [editableCode, setEditableCode] = useState("");

  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);
  const [selectedFullRun, setSelectedFullRun] = useState<FullRun | null>(null);
  const [detailTab, setDetailTab] = useState<"strategy" | "stocks">("strategy");
  const [summarizeTrigger, setSummarizeTrigger] = useState(0);

  const { data: strategies } = useApi<Strategy[]>("/strategies");
  const { data: runs, refetch: refetchRuns } = useApi<RunListItem[]>("/backtest/runs");
  const { data: analyzerStocks } = useApi<Array<{ symbol: string; name: string }>>("/analyzer/stocks");

  const selectedStrategy = useMemo(
    () => (strategies ?? []).find((s) => s.id === selectedStrategyId),
    [strategies, selectedStrategyId]
  );

  const handleStrategyChange = useCallback((id: string | null) => {
    setSelectedStrategyId(id);
    const strat = (strategies ?? []).find((s) => s.id === id);
    if (strat?.code) setEditableCode(strat.code);
    else setEditableCode("");
  }, [strategies]);

  const resolvedSymbols = useMemo(() => {
    if (stockSource === "custom") {
      return customSymbols
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    }
    return (analyzerStocks ?? []).map((s) => s.symbol);
  }, [stockSource, customSymbols, analyzerStocks]);

  const filteredAnalyzerStocks = useMemo(() => {
    if (!symbolSearch.trim()) return analyzerStocks ?? [];
    const q = symbolSearch.toLowerCase();
    return (analyzerStocks ?? []).filter(
      (s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
  }, [analyzerStocks, symbolSearch]);

  const backtestContext = useMemo(() => {
    if (!result) return undefined;
    return {
      backtest_metrics: result.metrics,
      backtest_trade_count: result.trades.length,
      backtest_symbols: [...new Set(result.trades.map((t) => t.symbol))],
    };
  }, [result]);

  const positionSize = capital / Math.min(maxPositions, Math.max(resolvedSymbols.length, 1));

  const codeToRun = showCodeEditor && editableCode.trim() ? editableCode : selectedStrategy?.code || "";

  async function handleRun() {
    if (!codeToRun) {
      setErrorMsg("Select a strategy with code first, or write code in the editor");
      setRunStatus("error");
      return;
    }
    if (resolvedSymbols.length === 0) {
      setErrorMsg("Add at least one stock");
      setRunStatus("error");
      return;
    }
    setRunStatus("running");
    setErrorMsg("");
    setResult(null);
    setSelectedRunId(null);
    try {
      const data = await apiPost<BacktestResult | { error: string }>("/backtest/execute", {
        strategy_id: selectedStrategy?.id ? parseInt(selectedStrategy.id) : null,
        code: codeToRun,
        symbols: resolvedSymbols,
        start_date: startDate,
        end_date: endDate,
        initial_capital: capital,
        stop_loss_pct: stopLoss,
        target_pct: targetPct,
        max_positions: maxPositions,
        trailing_stop_pct: trailingStop,
        slippage_bps: slippageBps,
        commission_pct: commissionPct,
      });
      if ("error" in data) {
        setErrorMsg((data as { error: string }).error);
        setRunStatus("error");
      } else {
        setResult(data as BacktestResult);
        setRunStatus("completed");
        setSummarizeTrigger((n) => n + 1);
        refetchRuns();
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
      setRunStatus("error");
    }
  }

  async function handleSelectRun(id: number) {
    setSelectedRunId(id);
    setLoadingRun(true);
    try {
      const data = await apiFetch<FullRun>(`/backtest/runs/${id}`);
      setSelectedFullRun(data);
      setResult({
        id: data.id,
        metrics: data.metrics,
        trades: data.trades,
        equity_curve: data.equity_curve,
        benchmark_curve: data.benchmark_curve,
        drawdown_curve: data.drawdown_curve,
        monthly_returns: data.monthly_returns,
        signals_by_date: data.signals_by_date,
      });
      setRunStatus("completed");
      setErrorMsg("");
      setSummarizeTrigger((n) => n + 1);
    } catch {
      setErrorMsg("Failed to load run");
    }
    setLoadingRun(false);
  }

  async function handleDeleteRun(id: number) {
    try {
      await apiFetch(`/backtest/runs/${id}`, { method: "DELETE" });
      refetchRuns();
      if (selectedRunId === id) {
        setSelectedRunId(null);
        setSelectedFullRun(null);
        setResult(null);
        setRunStatus("idle");
      }
    } catch {}
  }

  return (
    <ResizableGroup direction="horizontal" className="h-full">
      {/* Left: Run History + Detail Viewer */}
      <Panel defaultSize={20} minSize={14} maxSize={30} className="flex flex-col overflow-hidden border-r border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <History size={12} />
            Run History
          </div>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {(runs ?? []).length}
          </span>
        </div>

        {/* Run List */}
        <div className={cn("overflow-y-auto p-2 [scrollbar-width:thin]", selectedFullRun ? "max-h-[40%]" : "flex-1")}>
          {(runs ?? []).length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">No runs yet</div>
          ) : (
            <ul className="space-y-1">
              {(runs ?? []).map((run) => {
                const stratName = (strategies ?? []).find((s) => String(s.id) === String(run.strategy_id))?.name;
                return (
                  <li key={run.id} className="group">
                    <div
                      onClick={() => handleSelectRun(run.id)}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-left transition-colors",
                        selectedRunId === run.id
                          ? "bg-indigo-50 dark:bg-indigo-950/40"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            #{run.id}
                          </span>
                          <span className="flex items-center gap-0.5 text-xs font-semibold">
                            {run.total_return >= 0 ? (
                              <TrendingUp size={10} className="text-emerald-500" />
                            ) : (
                              <TrendingDown size={10} className="text-red-500" />
                            )}
                            <span className={run.total_return >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                              {run.total_return >= 0 ? "+" : ""}{run.total_return.toFixed(1)}%
                            </span>
                          </span>
                        </div>
                        {stratName && (
                          <div className="mt-0.5 truncate text-[10px] font-medium text-indigo-500 dark:text-indigo-400">
                            {stratName}
                          </div>
                        )}
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                          <span>{run.total_trades} trades</span>
                          <span>WR {run.win_rate.toFixed(0)}%</span>
                          <span>SR {run.sharpe_ratio.toFixed(1)}</span>
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {run.symbols.length} stocks · {run.start_date?.slice(0, 10) || "?"} → {run.end_date?.slice(0, 10) || "?"}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteRun(run.id); }}
                        className="mt-0.5 rounded p-0.5 text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 dark:text-slate-600 dark:hover:text-red-400"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Detail Viewer: Strategy + Stocks for selected run */}
        {selectedFullRun && (
          <div className="flex flex-1 flex-col border-t border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center border-b border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setDetailTab("strategy")}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                  detailTab === "strategy"
                    ? "border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400"
                    : "text-slate-400 hover:text-slate-300"
                )}
              >
                <FileCode size={10} />
                Strategy
              </button>
              <button
                onClick={() => setDetailTab("stocks")}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                  detailTab === "stocks"
                    ? "border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400"
                    : "text-slate-400 hover:text-slate-300"
                )}
              >
                <PackageOpen size={10} />
                Stocks
                <span className="ml-0.5 text-[9px] opacity-70">({selectedFullRun.symbols.length})</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
              {detailTab === "strategy" && (
                <div className="p-2">
                  {(() => {
                    const strat = (strategies ?? []).find((s) => String(s.id) === String(selectedFullRun.strategy_id));
                    return (
                      <>
                        {strat && (
                          <div className="mb-2 rounded-md bg-indigo-50 px-2 py-1.5 dark:bg-indigo-950/30">
                            <div className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                              {strat.name}
                            </div>
                            <div className="mt-0.5 text-[9px] text-indigo-500 dark:text-indigo-400">
                              v{strat.version} · {strat.strategy_type}
                            </div>
                          </div>
                        )}
                        {selectedFullRun.strategy_code ? (
                          <pre className="rounded-md bg-slate-950 p-2 text-[10px] leading-relaxed text-green-400 overflow-x-auto [scrollbar-width:thin] whitespace-pre-wrap break-all font-mono">
                            {selectedFullRun.strategy_code}
                          </pre>
                        ) : (
                          <div className="py-4 text-center text-[10px] text-slate-400">No code available</div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {detailTab === "stocks" && (
                <div className="p-2">
                  <div className="mb-2 text-[10px] text-slate-400">
                    {selectedFullRun.symbols.length} stock{selectedFullRun.symbols.length !== 1 ? "s" : ""} in this run
                    {selectedFullRun.start_date && (
                      <span className="ml-1">
                        · {selectedFullRun.start_date.slice(0, 10)} → {selectedFullRun.end_date.slice(0, 10)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedFullRun.symbols.map((sym) => (
                      <span
                        key={sym}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {sym}
                      </span>
                    ))}
                  </div>
                  {selectedFullRun.initial_capital && (
                    <div className="mt-3 space-y-1 rounded-md bg-slate-50 p-2 dark:bg-slate-800/50">
                      <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Run Config</div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                        <span className="text-slate-400">Capital</span>
                        <span className="text-slate-600 dark:text-slate-300 font-mono">₹{selectedFullRun.initial_capital.toLocaleString()}</span>
                        <span className="text-slate-400">Period</span>
                        <span className="text-slate-600 dark:text-slate-300 font-mono">{selectedFullRun.start_date.slice(0, 10)} → {selectedFullRun.end_date.slice(0, 10)}</span>
                        <span className="text-slate-400">Trades</span>
                        <span className="text-slate-600 dark:text-slate-300 font-mono">{result?.metrics?.total_trades ?? "—"}</span>
                        <span className="text-slate-400">Return</span>
                        <span className={cn("font-mono", (result?.metrics?.total_return_pct ?? 0) >= 0 ? "text-emerald-500" : "text-red-500")}>
                          {result?.metrics?.total_return_pct !== undefined ? `${result.metrics.total_return_pct >= 0 ? "+" : ""}${result.metrics.total_return_pct.toFixed(2)}%` : "—"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Panel>
      <ResizeHandle />

      {/* Center: Config + Results */}
      <Panel defaultSize={56} minSize={35}>
        <ResizableGroup direction="vertical" className="h-full">
          {/* Config Section */}
          <Panel defaultSize={showCodeEditor ? 50 : 35} minSize={20} maxSize={70} className="overflow-auto border-b border-slate-200 dark:border-slate-800">
            <div className="space-y-3 p-4">
              {/* Row 1: Strategy + Run button */}
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <BarChart3 size={12} />
                    Strategy
                  </div>
                  <div className="relative">
                    <select
                      value={selectedStrategyId ?? ""}
                      onChange={(e) => handleStrategyChange(e.target.value || null)}
                      className="w-full appearance-none rounded-md border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      <option value="">Select a strategy...</option>
                      {(strategies ?? []).filter((s) => s.code).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} (v{s.version}) — {s.strategy_type}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowCodeEditor(!showCodeEditor)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                      showCodeEditor
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                        : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700"
                    )}
                  >
                    <Code2 size={14} />
                    Code
                  </button>
                  <button
                    onClick={handleRun}
                    disabled={runStatus === "running" || !codeToRun}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-5 py-2 text-sm font-semibold text-white transition-colors",
                      runStatus === "running"
                        ? "bg-indigo-400 cursor-wait"
                        : "bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                    )}
                  >
                    {runStatus === "running" ? (
                      <><Loader2 size={14} className="animate-spin" /> Running...</>
                    ) : (
                      <><Play size={14} /> Run Backtest</>
                    )}
                  </button>
                </div>
              </div>

              {/* Inline Code Editor */}
              {showCodeEditor && (
                <div>
                  <div className="mb-1 text-[10px] font-medium text-slate-400">
                    Strategy Code {editableCode !== (selectedStrategy?.code || "") && (
                      <span className="ml-1 text-amber-400">(modified)</span>
                    )}
                  </div>
                  <textarea
                    value={editableCode}
                    onChange={(e) => setEditableCode(e.target.value)}
                    spellCheck={false}
                    className="w-full rounded-md border border-slate-200 bg-slate-950 px-3 py-2 font-mono text-xs text-green-400 outline-none focus:border-indigo-500 dark:border-slate-700"
                    rows={12}
                    placeholder="def analyze_stocks(sdk, symbols):&#10;    results = []&#10;    for symbol in symbols:&#10;        candles = sdk.get_historical(symbol, 20)&#10;        # ... your logic&#10;    return results"
                  />
                </div>
              )}

              {/* Row 2: Stocks */}
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Layers size={12} />
                  Stocks
                </div>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => setStockSource("strategy")}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      stockSource === "strategy"
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                        : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700"
                    )}
                  >
                    Analyzer Stocks ({(analyzerStocks ?? []).length})
                  </button>
                  <button
                    onClick={() => setStockSource("custom")}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      stockSource === "custom"
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                        : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700"
                    )}
                  >
                    Custom
                  </button>
                </div>

                {stockSource === "strategy" ? (
                  <div>
                    <div className="relative mb-1.5">
                      <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={symbolSearch}
                        onChange={(e) => setSymbolSearch(e.target.value)}
                        placeholder="Filter stocks..."
                        className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto [scrollbar-width:thin]">
                      {filteredAnalyzerStocks.slice(0, 100).map((s) => (
                        <span
                          key={s.symbol}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {s.symbol}
                        </span>
                      ))}
                      {filteredAnalyzerStocks.length > 100 && (
                        <span className="text-[10px] text-slate-400">+{filteredAnalyzerStocks.length - 100} more</span>
                      )}
                      {filteredAnalyzerStocks.length === 0 && (
                        <span className="text-xs text-slate-400">No stocks in analyzer. Send stocks from the Picker first.</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <textarea
                    value={customSymbols}
                    onChange={(e) => setCustomSymbols(e.target.value.toUpperCase())}
                    placeholder={"Enter symbols separated by commas or spaces\ne.g. RELIANCE, TCS, INFY, HDFCBANK"}
                    rows={2}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  />
                )}
                <div className="mt-1 text-[10px] text-slate-400">
                  {resolvedSymbols.length} stock{resolvedSymbols.length !== 1 ? "s" : ""} selected
                </div>
              </div>

              {/* Row 3: Date Range + Risk Params */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <Clock size={12} />
                    Date Range
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    />
                    <span className="text-xs text-slate-400">to</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <Settings2 size={12} />
                    Risk Parameters
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="mb-0.5 block text-[10px] text-slate-500 dark:text-slate-400">Capital ₹</label>
                      <input
                        type="number"
                        value={capital}
                        onChange={(e) => setCapital(Number(e.target.value))}
                        min={1000}
                        step={10000}
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-slate-500 dark:text-slate-400">Stop Loss %</label>
                      <input
                        type="number"
                        value={stopLoss}
                        onChange={(e) => setStopLoss(Number(e.target.value))}
                        min={0.5}
                        max={50}
                        step={0.5}
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-slate-500 dark:text-slate-400">Target %</label>
                      <input
                        type="number"
                        value={targetPct}
                        onChange={(e) => setTargetPct(Number(e.target.value))}
                        min={0.5}
                        max={100}
                        step={0.5}
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-slate-500 dark:text-slate-400">Max Pos</label>
                      <input
                        type="number"
                        value={maxPositions}
                        onChange={(e) => setMaxPositions(Number(e.target.value))}
                        min={1}
                        max={50}
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      />
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    ₹{positionSize.toLocaleString(undefined, { maximumFractionDigits: 0 })} per position
                  </div>
                </div>
              </div>

              {/* Advanced Parameters (collapsible) */}
              <div>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-slate-300 transition-colors"
                >
                  <ChevronRight size={10} className={cn("transition-transform", showAdvanced && "rotate-90")} />
                  Advanced: Slippage, Commissions, Trailing Stop
                </button>
                {showAdvanced && (
                  <div className="mt-2 grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-0.5 block text-[10px] text-slate-500 dark:text-slate-400">Trailing Stop %</label>
                      <input
                        type="number"
                        value={trailingStop}
                        onChange={(e) => setTrailingStop(Number(e.target.value))}
                        min={0}
                        max={50}
                        step={0.5}
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      />
                      <div className="mt-0.5 text-[9px] text-slate-400">0 = disabled</div>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-slate-500 dark:text-slate-400">Slippage (bps)</label>
                      <input
                        type="number"
                        value={slippageBps}
                        onChange={(e) => setSlippageBps(Number(e.target.value))}
                        min={0}
                        max={100}
                        step={1}
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      />
                      <div className="mt-0.5 text-[9px] text-slate-400">5 bps = 0.05%</div>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-slate-500 dark:text-slate-400">Commission %</label>
                      <input
                        type="number"
                        value={commissionPct}
                        onChange={(e) => setCommissionPct(Number(e.target.value))}
                        min={0}
                        max={1}
                        step={0.01}
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      />
                      <div className="mt-0.5 text-[9px] text-slate-400">Per side, on notional</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Error message */}
              {runStatus === "error" && errorMsg && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
                  {errorMsg}
                </div>
              )}
            </div>
          </Panel>
          <ResizeHandle />

          {/* Results Section */}
          <Panel defaultSize={showCodeEditor ? 50 : 65} minSize={30} className="overflow-auto p-3">
            <BacktestResultsPanel
              result={result}
              loading={runStatus === "running" || loadingRun}
              code={codeToRun}
              symbols={resolvedSymbols}
            />
          </Panel>
        </ResizableGroup>
      </Panel>

      <CollapsibleChatPanel
        title="Backtesting AI"
        placeholder="e.g. Why is the drawdown high? Suggest improvements..."
        tab="backtesting"
        analyzerContext={backtestContext}
        summarizeTrigger={summarizeTrigger}
      />
    </ResizableGroup>
  );
}
