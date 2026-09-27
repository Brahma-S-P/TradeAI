import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Wallet, Plus, TrendingUp, TrendingDown, RefreshCw, Trash2,
  ArrowUpCircle, ArrowDownCircle, X, BarChart3, Clock, DollarSign,
  Target, Shield, CircleDot, FileText, Activity, Settings2,
  Package, FlaskConical, LayoutGrid, Monitor, Search, Check,
  AlertTriangle, Minus, Play, Zap, Filter, Layers, Bot, User,
  CalendarDays, ChevronDown, ArrowUp, ArrowDown, Trophy, Skull,
} from "lucide-react";
import { ResizableGroup, Panel, ResizeHandle } from "@/components/panels/ResizablePanel";
import { CollapsibleChatPanel } from "@/components/panels/CollapsibleChatPanel";
import { MultiChartGrid, type MultiChartItem } from "@/components/panels/MultiChartGrid";
import { StockChartPanel } from "@/components/panels/StockChartPanel";
import { useApi } from "@/lib/useApi";
import { apiFetch, apiPost, apiPatch } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import { cn } from "@/lib/cn";

interface Account {
  id: number;
  name: string;
  initial_balance: number;
  cash_balance: number;
  equity: number;
  total_pnl: number;
  total_pnl_pct: number;
  open_positions: number;
  is_active: boolean;
  strategy_id: number | null;
  batch_id: number | null;
  tradable_symbols: string[];
  created_at: string | null;
}

interface Position {
  id: number;
  symbol: string;
  side: string;
  quantity: number;
  avg_price: number;
  ltp: number;
  invested: number;
  unrealized_pnl: number;
  unrealized_pnl_pct?: number;
  realized_pnl: number;
  opened_at: string | null;
}

interface OrderItem {
  id: number;
  symbol: string;
  side: string;
  order_type: string;
  quantity: number;
  price: number | null;
  trigger_price: number | null;
  status: string;
  filled_price: number | null;
  filled_at: string | null;
  reject_reason: string | null;
  strategy_id: number | null;
  created_at: string | null;
}

interface Trade {
  id: number;
  order_id: number;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  pnl: number;
  commission: number;
  executed_at: string | null;
  strategy_id: number | null;
  order_type: string | null;
}

interface Portfolio {
  account_id: number;
  name: string;
  initial_balance: number;
  cash_balance: number;
  invested: number;
  equity: number;
  total_pnl: number;
  total_pnl_pct: number;
  unrealized_pnl: number;
  realized_pnl: number;
  total_commission: number;
  open_positions: number;
  max_positions: number;
  positions: Position[];
}

interface PriceTick {
  type: string;
  data: Array<{ symbol: string; ltp: number; change_pct: number; volume: number }>;
}

interface StrategyItem { id: number; name: string; strategy_type: string; }
interface BatchItem { id: number; name: string; symbols: string[]; }

type BottomTab = "portfolio" | "orders" | "trades" | "results";

export function PaperTrade() {
  const [accountId, setAccountId] = useState<number | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [bottomTab, setBottomTab] = useState<BottomTab>("orders");
  const [prices, setPrices] = useState<Record<string, { ltp: number; change_pct: number }>>({});

  // Order form state
  const [orderSymbol, setOrderSymbol] = useState("");
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "SL">("MARKET");
  const [orderQty, setOrderQty] = useState(1);
  const [orderPrice, setOrderPrice] = useState<number | undefined>(undefined);
  const [orderTrigger, setOrderTrigger] = useState<number | undefined>(undefined);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderMsg, setOrderMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Per-account config (loaded from account)
  const [selectedStrategyId, setSelectedStrategyId] = useState<number | "">("");
  const [selectedBatchId, setSelectedBatchId] = useState<number | "">("");
  const [tradableSymbols, setTradableSymbols] = useState<string[]>([]);

  // Add stocks modal
  const [showAddStocks, setShowAddStocks] = useState(false);
  const [addStocksSearch, setAddStocksSearch] = useState("");
  const [addStocksSelected, setAddStocksSelected] = useState<Set<string>>(new Set());

  // Batch change confirmation
  const [pendingBatchChange, setPendingBatchChange] = useState<{ newBatchId: number; invalidSymbols: string[] } | null>(null);

  // Run Strategy modal
  const [showRunStrategy, setShowRunStrategy] = useState(false);
  const [runCapital, setRunCapital] = useState(0);
  const [runAddCash, setRunAddCash] = useState(0);
  const [runDistribution, setRunDistribution] = useState<"auto" | "custom">("auto");
  const [runAllocations, setRunAllocations] = useState<Record<string, { capital: number; qty: number }>>({});
  const [runStopLoss, setRunStopLoss] = useState(3);
  const [runTarget, setRunTarget] = useState(6);
  const [runMaxPerStock, setRunMaxPerStock] = useState(20);
  const [runIsRunning, setRunIsRunning] = useState(false);

  // Multi-chart viewer
  const [chartItems, setChartItems] = useState<MultiChartItem[]>([]);
  const [chartView, setChartView] = useState<"multi" | "single">("single");
  const [singleChartSymbol, setSingleChartSymbol] = useState<string | null>(null);
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set());
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);

  // Per-symbol strategy & mode
  const [symbolStrategies, setSymbolStrategies] = useState<Record<string, number | "">>({});
  const [symbolModes, setSymbolModes] = useState<Record<string, "auto" | "manual">>({});

  // Per-row inline qty for quick trade
  const [rowQty, setRowQty] = useState<Record<string, number>>({});

  // Strategy change confirmation popup
  const [strategyChangeConfirm, setStrategyChangeConfirm] = useState<{ symbol: string; newStrategyId: number | ""; oldStrategyId: number | "" } | null>(null);

  // Manual Buy modal
  const [showManualBuy, setShowManualBuy] = useState(false);
  const [manualBuySearch, setManualBuySearch] = useState("");
  const [manualBuySymbol, setManualBuySymbol] = useState("");
  const [manualBuyQty, setManualBuyQty] = useState(1);
  const [manualBuyType, setManualBuyType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [manualBuyPrice, setManualBuyPrice] = useState<number | undefined>(undefined);
  const [manualBuyLoading, setManualBuyLoading] = useState(false);

  // Bottom tab filters
  const [filterSymbol, setFilterSymbol] = useState("");
  const [filterSide, setFilterSide] = useState<"" | "BUY" | "SELL">("");
  const [filterStatus, setFilterStatus] = useState<"" | "FILLED" | "PENDING" | "CANCELLED" | "REJECTED">("");
  const [filterSource, setFilterSource] = useState<"" | "manual" | "algo">("");
  const [filterStrategy, setFilterStrategy] = useState<number | "">("");
  const [groupBy, setGroupBy] = useState<"" | "symbol" | "strategy" | "side" | "date">("");

  // Holdings filter/sort
  const [holdingsSearch, setHoldingsSearch] = useState("");
  const [holdingsPnl, setHoldingsPnl] = useState<"" | "winners" | "losers">("");
  const [holdingsStrategyFilter, setHoldingsStrategyFilter] = useState<number | "" | "none">("");
  const [holdingsSort, setHoldingsSort] = useState<"pnl" | "pnl_pct" | "value" | "symbol" | "qty">("pnl");
  const [holdingsSortDir, setHoldingsSortDir] = useState<"asc" | "desc">("desc");

  // Create account modal
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("Paper Account");
  const [createBalance, setCreateBalance] = useState(100000);

  const { data: accounts, refetch: refetchAccounts } = useApi<Account[]>("/paper/accounts");
  const { data: strategies } = useApi<StrategyItem[]>("/strategies");
  const { data: batches } = useApi<BatchItem[]>("/batches");
  const { data: universe } = useApi<{ symbol: string; name: string }[]>("/stocks/universe");

  const [chartSearchQuery, setChartSearchQuery] = useState("");
  const [chartSearchFocused, setChartSearchFocused] = useState(false);
  const chartSearchRef = useRef<HTMLInputElement>(null);

  const chartSearchResults = useMemo(() => {
    if (!chartSearchQuery || !universe) return [];
    const q = chartSearchQuery.toUpperCase();
    return universe.filter(s => s.symbol.includes(q) || s.name.toUpperCase().includes(q)).slice(0, 15);
  }, [chartSearchQuery, universe]);

  const selectChartSymbol = (sym: string) => {
    setOrderSymbol(sym);
    if (chartView === "single") setSingleChartSymbol(sym);
    else addChart(sym);
    setChartSearchQuery("");
    setChartSearchFocused(false);
  };

  // WebSocket for live prices — throttled to avoid excessive re-renders
  const { lastMessage: wsTick } = useWebSocket<PriceTick>(
    `ws://${window.location.hostname}:8000/ws/prices`
  );
  const pricesBuf = useRef<Record<string, { ltp: number; change_pct: number }>>({});
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (wsTick?.data) {
      for (const t of wsTick.data) {
        pricesBuf.current[t.symbol] = { ltp: t.ltp, change_pct: t.change_pct };
      }
      if (!flushTimer.current) {
        flushTimer.current = setTimeout(() => {
          setPrices(prev => ({ ...prev, ...pricesBuf.current }));
          pricesBuf.current = {};
          flushTimer.current = null;
        }, 300);
      }
    }
  }, [wsTick]);

  // Auto-select first account
  useEffect(() => {
    if (accounts && accounts.length > 0 && !accountId) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  // Load account config when switching accounts
  useEffect(() => {
    if (!accounts || !accountId) return;
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;
    setSelectedStrategyId(acc.strategy_id ?? "");
    setSelectedBatchId(acc.batch_id ?? "");
    setTradableSymbols(acc.tradable_symbols ?? []);
  }, [accountId, accounts]);

  // Current batch symbols
  const batchSymbols = useMemo(() => {
    if (!selectedBatchId || !batches) return [];
    const b = batches.find(x => x.id === selectedBatchId);
    return b?.symbols ?? [];
  }, [selectedBatchId, batches]);

  // Save account config to backend
  const saveAccountConfig = useCallback(async (patch: { strategy_id?: number | null; batch_id?: number | null; tradable_symbols?: string[] }) => {
    if (!accountId) return;
    await apiPatch(`/paper/accounts/${accountId}/config`, {
      strategy_id: patch.strategy_id !== undefined ? (patch.strategy_id ?? 0) : undefined,
      batch_id: patch.batch_id !== undefined ? (patch.batch_id ?? 0) : undefined,
      tradable_symbols: patch.tradable_symbols,
    });
  }, [accountId]);

  // Tradable ticker list (only tradable stocks)
  const tickerList = useMemo(() =>
    tradableSymbols
      .map(sym => [sym, prices[sym]] as const)
      .filter((entry): entry is [string, { ltp: number; change_pct: number }] => !!entry[1])
      .sort((a, b) => a[0].localeCompare(b[0])),
    [prices, tradableSymbols]
  );

  const refreshData = useCallback(async () => {
    if (!accountId) return;
    try {
      const [p, o, t] = await Promise.all([
        apiFetch<Portfolio>(`/paper/portfolio?account_id=${accountId}`),
        apiFetch<OrderItem[]>(`/paper/orders?account_id=${accountId}&limit=50`),
        apiFetch<Trade[]>(`/paper/trades?account_id=${accountId}&limit=50`),
      ]);
      setPortfolio(p);
      setOrders(o);
      setTrades(t);
    } catch { /* ignore */ }
  }, [accountId]);

  useEffect(() => {
    refreshData();
    const id = setInterval(refreshData, 5000);
    return () => clearInterval(id);
  }, [refreshData]);

  // Update position LTPs from WebSocket
  const livePositions = useMemo(() => {
    if (!portfolio?.positions) return [];
    return portfolio.positions.map((p) => {
      const live = prices[p.symbol];
      const ltp = live?.ltp ?? p.ltp;
      const unrealized = Math.round((ltp - p.avg_price) * p.quantity * 100) / 100;
      const invested = p.avg_price * p.quantity;
      return {
        ...p,
        ltp: Math.round(ltp * 100) / 100,
        unrealized_pnl: unrealized,
        unrealized_pnl_pct: invested > 0 ? Math.round(unrealized / invested * 10000) / 100 : 0,
      };
    });
  }, [portfolio, prices]);

  const liveEquity = useMemo(() => {
    if (!portfolio) return null;
    const unrealized = livePositions.reduce((s, p) => s + p.unrealized_pnl, 0);
    const invested = livePositions.reduce((s, p) => s + p.avg_price * p.quantity, 0);
    const equity = portfolio.cash_balance + invested + unrealized;
    return {
      equity: Math.round(equity * 100) / 100,
      total_pnl: Math.round((equity - portfolio.initial_balance) * 100) / 100,
      total_pnl_pct: Math.round((equity - portfolio.initial_balance) / portfolio.initial_balance * 10000) / 100,
      unrealized: Math.round(unrealized * 100) / 100,
    };
  }, [portfolio, livePositions]);

  const filteredHoldings = useMemo(() => {
    let list = [...livePositions];
    if (holdingsSearch) list = list.filter(p => p.symbol.toLowerCase().includes(holdingsSearch.toLowerCase()));
    if (holdingsPnl === "winners") list = list.filter(p => p.unrealized_pnl > 0);
    if (holdingsPnl === "losers") list = list.filter(p => p.unrealized_pnl < 0);
    if (holdingsStrategyFilter === "none") list = list.filter(p => !symbolStrategies[p.symbol]);
    else if (holdingsStrategyFilter) list = list.filter(p => symbolStrategies[p.symbol] === holdingsStrategyFilter);
    list.sort((a, b) => {
      let cmp = 0;
      if (holdingsSort === "pnl") cmp = a.unrealized_pnl - b.unrealized_pnl;
      else if (holdingsSort === "pnl_pct") cmp = (a.unrealized_pnl_pct ?? 0) - (b.unrealized_pnl_pct ?? 0);
      else if (holdingsSort === "value") cmp = (a.ltp * a.quantity) - (b.ltp * b.quantity);
      else if (holdingsSort === "symbol") cmp = a.symbol.localeCompare(b.symbol);
      else if (holdingsSort === "qty") cmp = a.quantity - b.quantity;
      return holdingsSortDir === "desc" ? -cmp : cmp;
    });
    return list;
  }, [livePositions, holdingsSearch, holdingsPnl, holdingsStrategyFilter, holdingsSort, holdingsSortDir, symbolStrategies]);

  const holdingsStats = useMemo(() => {
    const items = filteredHoldings;
    const totalInvested = items.reduce((s, p) => s + p.avg_price * p.quantity, 0);
    const totalMktValue = items.reduce((s, p) => s + p.ltp * p.quantity, 0);
    const totalPnl = items.reduce((s, p) => s + p.unrealized_pnl, 0);
    const winners = items.filter(p => p.unrealized_pnl > 0).length;
    const losers = items.filter(p => p.unrealized_pnl < 0).length;
    return { totalInvested, totalMktValue, totalPnl, winners, losers };
  }, [filteredHoldings]);

  const hasHoldingsFilter = holdingsSearch || holdingsPnl || holdingsStrategyFilter;
  const clearHoldingsFilters = () => { setHoldingsSearch(""); setHoldingsPnl(""); setHoldingsStrategyFilter(""); };

  const toggleHoldingsSort = (col: typeof holdingsSort) => {
    if (holdingsSort === col) setHoldingsSortDir(d => d === "desc" ? "asc" : "desc");
    else { setHoldingsSort(col); setHoldingsSortDir("desc"); }
  };

  async function handleCreateAccount() {
    await apiPost("/paper/accounts", { name: createName, initial_balance: createBalance });
    refetchAccounts();
    setShowCreate(false);
  }

  async function handleResetAccount() {
    if (!accountId) return;
    await apiPost(`/paper/accounts/${accountId}/reset`, {});
    refreshData();
    refetchAccounts();
  }

  async function handlePlaceOrder(side?: "BUY" | "SELL") {
    const useSide = side ?? orderSide;
    if (!accountId || !orderSymbol.trim()) return;
    setOrderLoading(true);
    setOrderMsg(null);
    try {
      const result = await apiPost<{ order_id?: number; status?: string; error?: string; filled_price?: number; pnl?: number }>(
        "/paper/orders",
        {
          account_id: accountId,
          symbol: orderSymbol.toUpperCase(),
          side: useSide,
          quantity: orderQty,
          order_type: orderType,
          price: orderType === "LIMIT" ? orderPrice : (prices[orderSymbol.toUpperCase()]?.ltp ?? undefined),
          trigger_price: orderType === "SL" ? orderTrigger : undefined,
        }
      );
      if (result.error) {
        setOrderMsg({ type: "error", text: result.error });
      } else {
        const fill = result.filled_price ? ` @ ₹${result.filled_price.toFixed(2)}` : "";
        const pnl = result.pnl ? ` (P&L: ₹${result.pnl.toFixed(2)})` : "";
        setOrderMsg({
          type: "success",
          text: `${result.status}${fill}${pnl}`,
        });
        refreshData();
        refetchAccounts();
      }
    } catch (e) {
      setOrderMsg({ type: "error", text: e instanceof Error ? e.message : "Order failed" });
    }
    setOrderLoading(false);
  }

  async function handleClosePosition(posId: number) {
    await apiPost(`/paper/positions/${posId}/close`, {});
    refreshData();
    refetchAccounts();
  }

  async function handleCancelOrder(orderId: number) {
    await apiPost(`/paper/orders/${orderId}/cancel`, {});
    refreshData();
  }

  function addChart(symbol: string) {
    if (chartItems.some((c) => c.symbol === symbol)) return;
    setChartItems((prev) => [...prev, { id: `${symbol}-${Date.now()}`, symbol }]);
  }

  function removeChart(id: string) {
    setChartItems((prev) => prev.filter((c) => c.id !== id));
  }

  function toggleIndicator(key: string) {
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function addAllSelectedCharts() {
    const existing = new Set(chartItems.map((c) => c.symbol));
    const toAdd = tradableSymbols.filter((s) => !existing.has(s));
    if (toAdd.length === 0) return;
    setChartItems((prev) => [
      ...prev,
      ...toAdd.map((s) => ({ id: `${s}-${Date.now()}`, symbol: s })),
    ]);
  }

  const estCost = useMemo(() => {
    const sym = orderSymbol.toUpperCase();
    const p = prices[sym]?.ltp || orderPrice || 0;
    return p * orderQty;
  }, [orderSymbol, orderQty, orderPrice, prices]);

  const pendingOrders = orders.filter((o) => o.status === "PENDING");

  // Helper: strategy name lookup
  const strategyName = useCallback((sid: number | null | undefined) => {
    if (!sid) return null;
    return (strategies ?? []).find(s => s.id === sid)?.name ?? null;
  }, [strategies]);

  // Helper: format datetime
  const fmtDateTime = (iso: string | null) => {
    if (!iso) return { date: "—", time: "" };
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }),
      time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
    };
  };

  // Filtered orders
  const filteredOrders = useMemo(() => {
    let list = [...orders];
    if (filterSymbol) list = list.filter(o => o.symbol.toLowerCase().includes(filterSymbol.toLowerCase()));
    if (filterSide) list = list.filter(o => o.side === filterSide);
    if (filterStatus) list = list.filter(o => o.status === filterStatus);
    if (filterSource === "manual") list = list.filter(o => !o.strategy_id);
    if (filterSource === "algo") list = list.filter(o => !!o.strategy_id);
    if (filterStrategy) list = list.filter(o => o.strategy_id === filterStrategy);
    return list;
  }, [orders, filterSymbol, filterSide, filterStatus, filterSource, filterStrategy]);

  // Filtered trades
  const filteredTrades = useMemo(() => {
    let list = [...trades];
    if (filterSymbol) list = list.filter(t => t.symbol.toLowerCase().includes(filterSymbol.toLowerCase()));
    if (filterSide) list = list.filter(t => t.side === filterSide);
    if (filterSource === "manual") list = list.filter(t => !t.strategy_id);
    if (filterSource === "algo") list = list.filter(t => !!t.strategy_id);
    if (filterStrategy) list = list.filter(t => t.strategy_id === filterStrategy);
    return list;
  }, [trades, filterSymbol, filterSide, filterSource, filterStrategy]);

  // Group helper
  function groupItems<T extends { symbol: string; strategy_id?: number | null; side?: string; created_at?: string | null; executed_at?: string | null }>(items: T[], by: string): Record<string, T[]> {
    if (!by) return { "": items };
    const groups: Record<string, T[]> = {};
    for (const item of items) {
      let key = "";
      if (by === "symbol") key = item.symbol;
      else if (by === "strategy") key = strategyName(item.strategy_id ?? null) ?? "Manual";
      else if (by === "side") key = item.side ?? "—";
      else if (by === "date") {
        const dt = (item as any).created_at ?? (item as any).executed_at;
        key = dt ? new Date(dt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "Unknown";
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }

  // Check if any filter is active
  const hasActiveFilter = filterSymbol || filterSide || filterStatus || filterSource || filterStrategy || groupBy;
  const clearFilters = () => { setFilterSymbol(""); setFilterSide(""); setFilterStatus(""); setFilterSource(""); setFilterStrategy(""); setGroupBy(""); };

  return (
    <ResizableGroup direction="horizontal" className="h-full">
      {/* Left Panel: Paper Account Config */}
      <Panel defaultSize={18} minSize={10} maxSize={30} className="flex flex-col overflow-hidden border-r border-slate-200 dark:border-slate-800">
        <ResizableGroup direction="vertical" className="h-full">
          {/* Top: Config + Batch Stocks */}
          <Panel defaultSize={60} minSize={20} className="flex flex-col overflow-hidden">
            {/* Account selector */}
            <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Wallet size={12} />
                Account
              </div>
              <div className="flex items-center gap-1">
                {(accounts ?? []).length > 0 ? (
                  <select
                    value={accountId ?? ""}
                    onChange={(e) => setAccountId(Number(e.target.value))}
                    className="rounded border border-slate-700 bg-slate-900 py-1 px-2 text-xs text-slate-300 outline-none"
                  >
                    {(accounts ?? []).map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                ) : (
                  <button onClick={() => setShowCreate(true)} className="text-xs text-indigo-400 hover:underline">+ New</button>
                )}
                <button onClick={() => setShowCreate(true)} className="rounded p-1 text-slate-500 hover:bg-slate-800" title="New account"><Plus size={14} /></button>
              </div>
            </div>

            {/* Quick symbol search → chart */}
            <div className="border-b border-slate-700 px-3 py-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">View Chart</div>
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 z-10" />
                <input
                  ref={chartSearchRef}
                  type="text"
                  value={chartSearchQuery}
                  onChange={(e) => setChartSearchQuery(e.target.value)}
                  onFocus={() => setChartSearchFocused(true)}
                  onBlur={() => setTimeout(() => setChartSearchFocused(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && chartSearchResults.length > 0) {
                      selectChartSymbol(chartSearchResults[0].symbol);
                    } else if (e.key === "Escape") {
                      setChartSearchQuery("");
                      setChartSearchFocused(false);
                      chartSearchRef.current?.blur();
                    }
                  }}
                  placeholder="Search stocks..."
                  className="w-full rounded border border-slate-700 bg-slate-900 py-1.5 pl-7 pr-2 text-xs text-slate-300 outline-none focus:border-indigo-500 placeholder:text-slate-600"
                />
                {chartSearchFocused && chartSearchQuery && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-[280px] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
                    {chartSearchResults.length === 0 ? (
                      <div className="px-3 py-2 text-[10px] text-slate-500">No stocks found</div>
                    ) : (
                      chartSearchResults.map(s => (
                        <button
                          key={s.symbol}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectChartSymbol(s.symbol)}
                          className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-slate-800 transition-colors"
                        >
                          <span className="text-xs font-semibold text-slate-200">{s.symbol}</span>
                          <span className="text-[10px] text-slate-500 truncate ml-2 max-w-[100px]">{s.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Strategy selector */}
            <div className="border-b border-slate-700 px-3 py-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Strategy</div>
              <select
                value={selectedStrategyId}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : "";
                  setSelectedStrategyId(v);
                  saveAccountConfig({ strategy_id: v || null });
                }}
                className="w-full rounded border border-slate-700 bg-slate-900 py-1 px-2 text-xs text-slate-300 outline-none"
              >
                <option value="">Select Strategy</option>
                {(strategies ?? []).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Batch selector */}
            <div className="border-b border-slate-700 px-3 py-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Watchlist / Batch</div>
              <select
                value={selectedBatchId}
                onChange={(e) => {
                  const newId = e.target.value ? Number(e.target.value) : "";
                  if (!newId) {
                    setSelectedBatchId("");
                    saveAccountConfig({ batch_id: null });
                    return;
                  }
                  if (tradableSymbols.length > 0 && selectedBatchId) {
                    const newBatch = (batches ?? []).find(b => b.id === newId);
                    const newBatchSyms = new Set(newBatch?.symbols ?? []);
                    const invalid = tradableSymbols.filter(s => !newBatchSyms.has(s));
                    if (invalid.length > 0) {
                      setPendingBatchChange({ newBatchId: newId, invalidSymbols: invalid });
                      return;
                    }
                  }
                  setSelectedBatchId(newId);
                  saveAccountConfig({ batch_id: newId });
                }}
                className="w-full rounded border border-slate-700 bg-slate-900 py-1 px-2 text-xs text-slate-300 outline-none"
              >
                <option value="">Select Batch</option>
                {(batches ?? []).map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.symbols.length})</option>
                ))}
              </select>
            </div>

            {/* Batch Stocks header */}
            <div className="border-b border-slate-700 px-3 py-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Batch Stocks ({batchSymbols.length})
              </div>
            </div>

            {/* Batch stocks list */}
            <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
              {batchSymbols.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-slate-500">Select a batch first.</div>
              ) : (
                <div>
                  {batchSymbols.map(sym => {
                    const tick = prices[sym];
                    const alreadyTradable = tradableSymbols.includes(sym);
                    return (
                      <div
                        key={sym}
                        className={cn(
                          "group flex w-full items-center justify-between px-3 py-1 text-xs transition-colors hover:bg-slate-800/50",
                          orderSymbol === sym && "bg-indigo-950/30"
                        )}
                      >
                        <button
                          onClick={() => {
                            setOrderSymbol(sym);
                            if (chartView === "single") setSingleChartSymbol(sym);
                            else addChart(sym);
                          }}
                          className="flex flex-1 items-center justify-between min-w-0"
                        >
                          <span className="font-semibold text-slate-200 truncate">{sym}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            {tick ? (
                              <>
                                <span className="font-mono text-slate-300">₹{tick.ltp.toFixed(1)}</span>
                                <span className={cn("font-mono w-12 text-right", tick.change_pct >= 0 ? "text-emerald-400" : "text-red-400")}>
                                  {tick.change_pct >= 0 ? "+" : ""}{tick.change_pct.toFixed(1)}%
                                </span>
                              </>
                            ) : (
                              <span className="font-mono text-slate-600">—</span>
                            )}
                          </div>
                        </button>
                        {!alreadyTradable ? (
                          <button
                            onClick={() => {
                              const next = [...tradableSymbols, sym].sort();
                              setTradableSymbols(next);
                              saveAccountConfig({ tradable_symbols: next });
                            }}
                            className="ml-1 rounded p-0.5 text-slate-600 opacity-0 group-hover:opacity-100 hover:text-emerald-400 hover:bg-slate-700 transition-all"
                            title="Add to tradable"
                          >
                            <Plus size={12} />
                          </button>
                        ) : (
                          <Check size={12} className="ml-1 text-emerald-600 shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Panel>

          <ResizeHandle />

          {/* Bottom: Tradable Stocks */}
          <Panel defaultSize={40} minSize={15} className="flex flex-col overflow-hidden">
            {/* Tradable header */}
            <div className="flex items-center justify-between border-b border-slate-700 px-3 py-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Tradable Stocks ({tradableSymbols.length})
              </div>
              <button
                onClick={() => {
                  if (!selectedBatchId) return;
                  setAddStocksSearch("");
                  setAddStocksSelected(new Set(tradableSymbols));
                  setShowAddStocks(true);
                }}
                disabled={!selectedBatchId}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold text-indigo-400 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={12} /> Add
              </button>
            </div>

            {/* Tradable stocks list */}
            <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
              {tradableSymbols.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-slate-500">
                  {selectedBatchId ? "Click + Add to select stocks." : "Select a batch first."}
                </div>
              ) : (
                <div>
                  {tradableSymbols.sort().map(sym => {
                    const tick = prices[sym];
                    return (
                      <div
                        key={sym}
                        className={cn(
                          "group flex w-full items-center justify-between px-3 py-1 text-xs transition-colors hover:bg-slate-800/50",
                          orderSymbol === sym && "bg-indigo-950/30"
                        )}
                      >
                        <button
                          onClick={() => {
                            setOrderSymbol(sym);
                            if (chartView === "single") setSingleChartSymbol(sym);
                            else addChart(sym);
                          }}
                          className="flex flex-1 items-center justify-between min-w-0"
                        >
                          <span className="font-semibold text-slate-200 truncate">{sym}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            {tick ? (
                              <>
                                <span className="font-mono text-slate-300">₹{tick.ltp.toFixed(1)}</span>
                                <span className={cn("font-mono w-12 text-right", tick.change_pct >= 0 ? "text-emerald-400" : "text-red-400")}>
                                  {tick.change_pct >= 0 ? "+" : ""}{tick.change_pct.toFixed(1)}%
                                </span>
                              </>
                            ) : (
                              <span className="font-mono text-slate-600">—</span>
                            )}
                          </div>
                        </button>
                        <button
                          onClick={() => {
                            const next = tradableSymbols.filter(s => s !== sym);
                            setTradableSymbols(next);
                            saveAccountConfig({ tradable_symbols: next });
                          }}
                          className="ml-1 rounded p-0.5 text-slate-600 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-slate-700 transition-all"
                          title="Remove from tradable"
                        >
                          <Minus size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Run Strategy button */}
            <div className="shrink-0 border-t border-slate-700 px-3 py-2">
              <button
                onClick={() => {
                  const acc = (accounts ?? []).find(a => a.id === accountId);
                  const cash = acc?.cash_balance ?? 0;
                  setRunCapital(cash);
                  setRunAddCash(0);
                  const perStock = tradableSymbols.length > 0 ? Math.floor(cash / tradableSymbols.length) : 0;
                  const allocs: Record<string, { capital: number; qty: number }> = {};
                  tradableSymbols.forEach(sym => {
                    const ltp = prices[sym]?.ltp ?? 0;
                    const qty = ltp > 0 ? Math.floor(perStock / ltp) : 0;
                    allocs[sym] = { capital: perStock, qty };
                  });
                  setRunAllocations(allocs);
                  setRunDistribution("auto");
                  setRunStopLoss(3);
                  setRunTarget(6);
                  setRunMaxPerStock(20);
                  setShowRunStrategy(true);
                }}
                disabled={!selectedStrategyId || tradableSymbols.length === 0 || runIsRunning}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-md py-2 text-xs font-bold uppercase tracking-wider transition-all",
                  runIsRunning
                    ? "bg-amber-600/20 text-amber-400 border border-amber-600/30 cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                {runIsRunning ? (
                  <>
                    <Activity size={14} className="animate-pulse" />
                    Strategy Running...
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    Run Strategy
                  </>
                )}
              </button>
            </div>
          </Panel>
        </ResizableGroup>
      </Panel>
      <ResizeHandle />

      {/* Center: Portfolio Overview + Charts + Results */}
      <Panel defaultSize={55} minSize={20}>
        <ResizableGroup direction="vertical" className="h-full">
          {/* Portfolio Overview */}
          <Panel defaultSize={50} minSize={15} className="flex flex-col overflow-hidden border-b border-slate-800">
            <div className="flex-1 overflow-auto [scrollbar-width:thin]">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
                <h2 className="text-sm font-bold text-slate-100">Portfolio Overview</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={refreshData}
                    className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw size={12} />
                  </button>
                  <button
                    onClick={() => {
                      setManualBuySearch("");
                      setManualBuySymbol("");
                      setManualBuyQty(1);
                      setManualBuyType("MARKET");
                      setManualBuyPrice(undefined);
                      setShowManualBuy(true);
                    }}
                    className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700 transition-colors"
                  >
                    <Plus size={12} />
                    Manual Buy
                  </button>
                </div>
              </div>

              {/* Summary Cards */}
              {portfolio && liveEquity && (() => {
                const totalInvested = livePositions.reduce((s, p) => s + p.avg_price * p.quantity, 0);
                const totalMktValue = livePositions.reduce((s, p) => s + p.ltp * p.quantity, 0);
                const dayPnl = liveEquity.unrealized;
                const dayPnlPct = totalInvested > 0 ? (dayPnl / totalInvested) * 100 : 0;
                return (
                  <div className="grid grid-cols-5 gap-3 px-4 py-3">
                    {/* Portfolio Value */}
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Portfolio Value</div>
                      <div className="font-mono text-lg font-bold text-slate-50 mt-0.5">
                        ₹{liveEquity.equity.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                      <div className={cn("text-[10px] font-mono font-medium mt-0.5", liveEquity.total_pnl_pct >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {liveEquity.total_pnl_pct >= 0 ? "+" : ""}{liveEquity.total_pnl_pct.toFixed(2)}%
                      </div>
                    </div>
                    {/* Cash Holdings */}
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Cash Holdings</div>
                      <div className="font-mono text-lg font-bold text-blue-400 mt-0.5">
                        ₹{portfolio.cash_balance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    {/* Day P&L */}
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Day P&L</div>
                      <div className={cn("font-mono text-lg font-bold mt-0.5", dayPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {dayPnl >= 0 ? "+" : ""}₹{dayPnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                      <div className={cn("text-[10px] font-mono font-medium mt-0.5", dayPnlPct >= 0 ? "text-emerald-400" : "text-red-400")}>
                        ({dayPnlPct >= 0 ? "+" : ""}{dayPnlPct.toFixed(2)}%)
                      </div>
                    </div>
                    {/* Unrealized P&L */}
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Unrealized P&L</div>
                      <div className={cn("font-mono text-lg font-bold mt-0.5", liveEquity.unrealized >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {liveEquity.unrealized >= 0 ? "+" : ""}₹{liveEquity.unrealized.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                      <div className={cn("text-[10px] font-mono font-medium mt-0.5", liveEquity.unrealized >= 0 ? "text-emerald-400" : "text-red-400")}>
                        ({totalInvested > 0 ? ((liveEquity.unrealized / totalInvested) * 100).toFixed(2) : "0.00"}%)
                      </div>
                    </div>
                    {/* Realized P&L */}
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Realized P&L</div>
                      <div className={cn("font-mono text-lg font-bold mt-0.5", portfolio.realized_pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {portfolio.realized_pnl >= 0 ? "+" : ""}₹{portfolio.realized_pnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                      <div className={cn("text-[10px] font-mono font-medium mt-0.5", portfolio.realized_pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                        ({portfolio.initial_balance > 0 ? ((portfolio.realized_pnl / portfolio.initial_balance) * 100).toFixed(2) : "0.00"}%)
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Current Holdings */}
              <div className="px-4 pt-1 pb-2">
                {/* Row 1: Title + Summary chips */}
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-xs font-bold text-slate-200">
                    Current Holdings{" "}
                    {hasHoldingsFilter
                      ? `(${filteredHoldings.length} of ${livePositions.length})`
                      : `(${livePositions.length})`}
                  </h3>
                  {livePositions.length > 0 && (
                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className="text-slate-500">Invested <span className="text-slate-300">₹{holdingsStats.totalInvested.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></span>
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-500">Mkt Val <span className="text-slate-300">₹{holdingsStats.totalMktValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></span>
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-500">P&L <span className={holdingsStats.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}>{holdingsStats.totalPnl >= 0 ? "+" : ""}₹{Math.abs(holdingsStats.totalPnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span></span>
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-500"><Trophy size={9} className="inline text-emerald-500 mr-0.5" />{holdingsStats.winners} <Skull size={9} className="inline text-red-500 ml-1 mr-0.5" />{holdingsStats.losers}</span>
                    </div>
                  )}
                </div>

                {/* Row 2: Filter & Sort bar */}
                {livePositions.length > 0 && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="relative">
                      <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        value={holdingsSearch}
                        onChange={(e) => setHoldingsSearch(e.target.value)}
                        placeholder="Search..."
                        className="rounded border border-slate-700 bg-slate-900 py-1 pl-7 pr-2 text-[11px] text-slate-300 outline-none focus:border-indigo-500 w-28"
                      />
                    </div>
                    <select value={holdingsPnl} onChange={(e) => setHoldingsPnl(e.target.value as any)} className="rounded border border-slate-700 bg-slate-900 py-1 px-2 text-[11px] text-slate-300 outline-none focus:border-indigo-500">
                      <option value="">All P&L</option>
                      <option value="winners">Winners</option>
                      <option value="losers">Losers</option>
                    </select>
                    {(strategies ?? []).length > 0 && (
                      <select value={holdingsStrategyFilter} onChange={(e) => setHoldingsStrategyFilter(e.target.value === "none" ? "none" as any : e.target.value ? Number(e.target.value) : "")} className="rounded border border-slate-700 bg-slate-900 py-1 px-2 text-[11px] text-slate-300 outline-none focus:border-indigo-500 max-w-[120px]">
                        <option value="">All Strategies</option>
                        <option value="none">None (Manual)</option>
                        {(strategies ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500">Sort:</span>
                      <select value={holdingsSort} onChange={(e) => setHoldingsSort(e.target.value as any)} className="rounded border border-slate-700 bg-slate-900 py-1 px-2 text-[11px] text-slate-300 outline-none focus:border-indigo-500">
                        <option value="pnl">P&L</option>
                        <option value="pnl_pct">P&L %</option>
                        <option value="value">Market Value</option>
                        <option value="symbol">Symbol</option>
                        <option value="qty">Quantity</option>
                      </select>
                      <button onClick={() => setHoldingsSortDir(d => d === "desc" ? "asc" : "desc")} className="rounded border border-slate-700 bg-slate-900 p-1 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors" title={holdingsSortDir === "desc" ? "Descending" : "Ascending"}>
                        {holdingsSortDir === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                      </button>
                      {hasHoldingsFilter && (
                        <button onClick={clearHoldingsFilters} className="rounded border border-slate-700 bg-slate-900 p-1 text-red-400 hover:text-red-300 hover:border-red-800 transition-colors" title="Clear filters">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {livePositions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                    <Package size={28} className="mb-2 text-slate-600" />
                    <div className="text-xs font-medium">No open positions</div>
                    <div className="text-[10px] text-slate-600 mt-1">Click "Manual Buy" or use Run Strategy to start trading</div>
                  </div>
                ) : filteredHoldings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-slate-500">
                    <Filter size={22} className="mb-2 text-slate-600" />
                    <div className="text-xs font-medium">No positions match filters</div>
                    <button onClick={clearHoldingsFilters} className="mt-2 text-[10px] text-indigo-400 hover:text-indigo-300">Clear filters</button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/80">
                        <tr className="border-b border-slate-700">
                          <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 w-6"></th>
                          <th onClick={() => toggleHoldingsSort("symbol")} className="px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 cursor-pointer hover:text-slate-300 select-none">
                            Symbol {holdingsSort === "symbol" && (holdingsSortDir === "desc" ? "▼" : "▲")}
                          </th>
                          <th className="px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Strategy</th>
                          <th onClick={() => toggleHoldingsSort("qty")} className="px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right cursor-pointer hover:text-slate-300 select-none">
                            Qty {holdingsSort === "qty" && (holdingsSortDir === "desc" ? "▼" : "▲")}
                          </th>
                          <th className="px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right">Bought At</th>
                          <th className="px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right">Current Price</th>
                          <th onClick={() => toggleHoldingsSort("value")} className="px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right cursor-pointer hover:text-slate-300 select-none">
                            Market Value {holdingsSort === "value" && (holdingsSortDir === "desc" ? "▼" : "▲")}
                          </th>
                          <th onClick={() => toggleHoldingsSort("pnl")} className="px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right cursor-pointer hover:text-slate-300 select-none">
                            P&L {holdingsSort === "pnl" && (holdingsSortDir === "desc" ? "▼" : "▲")}
                          </th>
                          <th onClick={() => toggleHoldingsSort("pnl_pct")} className="px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right cursor-pointer hover:text-slate-300 select-none">
                            P&L % {holdingsSort === "pnl_pct" && (holdingsSortDir === "desc" ? "▼" : "▲")}
                          </th>
                          <th className="px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHoldings.map((p) => {
                          const invested = p.avg_price * p.quantity;
                          const mktValue = p.ltp * p.quantity;
                          const pnlPct = p.unrealized_pnl_pct ?? 0;
                          const currentStrategy = symbolStrategies[p.symbol] ?? "";
                          const tradeDate = p.opened_at ? new Date(p.opened_at) : null;
                          const qty = rowQty[p.symbol] ?? p.quantity;
                          const isUp = p.ltp >= p.avg_price;

                          return (
                            <tr
                              key={p.id}
                              onClick={() => {
                                setOrderSymbol(p.symbol);
                                if (chartView === "single") setSingleChartSymbol(p.symbol);
                                else addChart(p.symbol);
                              }}
                              className="cursor-pointer border-b border-slate-800/40 transition-all hover:bg-slate-800/30"
                            >
                              {/* Trend arrow */}
                              <td className="px-3 py-3">
                                {isUp ? (
                                  <ArrowUpCircle size={16} className="text-emerald-400" />
                                ) : (
                                  <ArrowDownCircle size={16} className="text-red-400" />
                                )}
                              </td>
                              {/* Symbol */}
                              <td className="px-2 py-3 font-semibold text-[13px] text-slate-100">{p.symbol}</td>
                              {/* Strategy */}
                              <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                                <select
                                  value={currentStrategy}
                                  onChange={(e) => {
                                    const newVal = e.target.value ? Number(e.target.value) : "";
                                    setStrategyChangeConfirm({ symbol: p.symbol, newStrategyId: newVal, oldStrategyId: currentStrategy });
                                  }}
                                  className="w-full max-w-[110px] rounded border border-slate-700/60 bg-slate-800/50 py-1 px-2 text-[11px] text-slate-300 outline-none hover:border-slate-600 focus:border-indigo-500 transition-colors"
                                >
                                  <option value="">None</option>
                                  {(strategies ?? []).map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                              </td>
                              {/* Qty */}
                              <td className="px-2 py-3 font-mono text-slate-200 text-right font-semibold text-[13px]">{p.quantity}</td>
                              {/* Bought At */}
                              <td className="px-2 py-3 text-right">
                                <div className="font-mono text-[12px] text-slate-300">₹{p.avg_price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                {tradeDate && (
                                  <div className="font-mono text-[10px] text-slate-500">
                                    {tradeDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} {tradeDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}
                                  </div>
                                )}
                              </td>
                              {/* Current Price */}
                              <td className={cn("px-2 py-3 font-mono text-right font-semibold text-[13px]", isUp ? "text-emerald-300" : "text-red-300")}>
                                ₹{p.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              {/* Market Value */}
                              <td className="px-2 py-3 font-mono text-slate-200 text-right text-[12px]">₹{mktValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                              {/* P&L */}
                              <td className={cn("px-2 py-3 font-mono font-bold text-right text-[12px]", p.unrealized_pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                                {p.unrealized_pnl >= 0 ? "+" : ""}₹{Math.abs(p.unrealized_pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                              </td>
                              {/* P&L % */}
                              <td className="px-2 py-3 text-right">
                                <span className={cn(
                                  "inline-block rounded px-2 py-0.5 font-mono text-[11px] font-bold",
                                  pnlPct >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                                )}>
                                  {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                                </span>
                              </td>
                              {/* Actions */}
                              <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1.5">
                                  <input
                                    type="number"
                                    value={qty}
                                    onChange={(e) => setRowQty(prev => ({ ...prev, [p.symbol]: Math.max(1, Number(e.target.value)) }))}
                                    min={1}
                                    className="w-14 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-center text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500"
                                  />
                                  <button
                                    onClick={async () => {
                                      setOrderSymbol(p.symbol);
                                      setOrderQty(qty);
                                      await handlePlaceOrder("BUY");
                                    }}
                                    className="rounded bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition-colors"
                                  >
                                    BUY
                                  </button>
                                  <button
                                    onClick={async () => {
                                      setOrderSymbol(p.symbol);
                                      setOrderQty(qty);
                                      await handlePlaceOrder("SELL");
                                    }}
                                    className="rounded bg-red-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-red-700 transition-colors"
                                  >
                                    SELL
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </Panel>
          <ResizeHandle />

          {/* Chart Viewer */}
          <Panel defaultSize={52} minSize={3} className="flex flex-col overflow-hidden border-b border-slate-200 dark:border-slate-800">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-2 py-1 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-md border border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setChartView("single")}
                    className={cn(
                      "flex items-center gap-1 rounded-l-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                      chartView === "single"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    <Monitor size={10} />
                    Single
                  </button>
                  <button
                    onClick={() => setChartView("multi")}
                    className={cn(
                      "flex items-center gap-1 rounded-r-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                      chartView === "multi"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    <LayoutGrid size={10} />
                    Multi
                    {chartItems.length > 0 && (
                      <span className="rounded-full bg-slate-200 px-1 text-[8px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {chartItems.length}
                      </span>
                    )}
                  </button>
                </div>
                {tradableSymbols.length > 0 && chartView === "multi" && (
                  <button
                    onClick={addAllSelectedCharts}
                    className="rounded px-2 py-0.5 text-[9px] font-semibold text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                  >
                    + Add selected ({tradableSymbols.length})
                  </button>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                {/* Indicators dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowIndicatorMenu((v) => !v)}
                    className={cn(
                      "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
                      activeIndicators.size > 0
                        ? "bg-indigo-600/20 text-indigo-400"
                        : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    Indicators{activeIndicators.size > 0 && ` (${activeIndicators.size})`}
                  </button>
                  {showIndicatorMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowIndicatorMenu(false)} />
                      <div className="absolute right-0 top-full z-50 mt-1 rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                        <div className="grid grid-cols-3 gap-1" style={{ minWidth: 240 }}>
                          {([
                            { key: "sma", label: "SMA" },
                            { key: "ema", label: "EMA" },
                            { key: "rsi", label: "RSI" },
                            { key: "macd", label: "MACD" },
                            { key: "bollinger", label: "Bollinger" },
                            { key: "volume", label: "Volume" },
                            { key: "vwap", label: "VWAP" },
                            { key: "supertrend", label: "Supertrend" },
                            { key: "atr", label: "ATR" },
                            { key: "stochastic", label: "Stoch" },
                            { key: "obv", label: "OBV" },
                          ] as const).map((ind) => (
                            <button
                              key={ind.key}
                              onClick={() => toggleIndicator(ind.key)}
                              className={cn(
                                "rounded px-2 py-1 text-[10px] font-medium transition-colors",
                                activeIndicators.has(ind.key)
                                  ? "bg-indigo-600 text-white"
                                  : "border border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                              )}
                            >
                              {ind.label}
                            </button>
                          ))}
                        </div>
                        {activeIndicators.size > 0 && (
                          <button
                            onClick={() => setActiveIndicators(new Set())}
                            className="mt-1.5 w-full rounded px-2 py-0.5 text-[9px] text-red-400 hover:bg-red-500/10"
                          >
                            Clear all
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {(chartView === "single" ? singleChartSymbol : chartItems.length > 0) && (
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
                        if (chartView === "single") {
                          setSingleChartSymbol(null);
                        } else {
                          setChartItems([]);
                        }
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950 dark:hover:text-red-400"
                      title={chartView === "single" ? "Clear chart" : "Clear all charts"}
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1">
              {chartView === "single" ? (
                singleChartSymbol ? (
                  <StockChartPanel
                    symbol={singleChartSymbol}
                    onClose={() => setSingleChartSymbol(null)}
                    indicators={activeIndicators}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">
                    Click a stock from Live Prices to view its chart
                  </div>
                )
              ) : (
                chartItems.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-500">
                    <LayoutGrid size={28} className="text-slate-600" />
                    <div className="text-xs font-medium">Multi-Chart Viewer</div>
                    <div className="text-[10px] text-slate-500">
                      Click a stock from Live Prices or use "Add selected" to load charts
                    </div>
                  </div>
                ) : (
                  <MultiChartGrid
                    charts={chartItems}
                    onRemove={removeChart}
                    onReorder={setChartItems}
                    indicators={activeIndicators}
                  />
                )
              )}
            </div>
          </Panel>
          <ResizeHandle />

          {/* Bottom: Orders / Trades / Results */}
          <Panel defaultSize={40} minSize={3} className="flex flex-col overflow-hidden">
            {/* Tab bar + filter bar */}
            <div className="border-b border-slate-700">
              <div className="flex items-center gap-1 px-3 py-1.5">
                {(["orders", "trades", "results"] as BottomTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setBottomTab(tab)}
                    className={cn(
                      "rounded px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                      bottomTab === tab
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                    )}
                  >
                    {tab}
                    {tab === "orders" && pendingOrders.length > 0 && (
                      <span className="ml-1 text-[9px] opacity-70">{pendingOrders.length}</span>
                    )}
                  </button>
                ))}

                {/* Filter controls inline */}
                <div className="ml-3 flex items-center gap-1.5 border-l border-slate-700 pl-3">
                  <Filter size={10} className="text-slate-500" />
                  <input
                    value={filterSymbol}
                    onChange={e => setFilterSymbol(e.target.value)}
                    placeholder="Symbol..."
                    className="w-16 rounded border border-slate-700/50 bg-slate-800/50 px-1.5 py-0.5 text-[9px] text-slate-300 outline-none placeholder:text-slate-600 focus:border-indigo-500"
                  />
                  <select value={filterSide} onChange={e => setFilterSide(e.target.value as any)} className="rounded border border-slate-700/50 bg-slate-800/50 px-1 py-0.5 text-[9px] text-slate-300 outline-none">
                    <option value="">All Sides</option>
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                  {bottomTab === "orders" && (
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="rounded border border-slate-700/50 bg-slate-800/50 px-1 py-0.5 text-[9px] text-slate-300 outline-none">
                      <option value="">All Status</option>
                      <option value="FILLED">FILLED</option>
                      <option value="PENDING">PENDING</option>
                      <option value="CANCELLED">CANCELLED</option>
                      <option value="REJECTED">REJECTED</option>
                    </select>
                  )}
                  <select value={filterSource} onChange={e => setFilterSource(e.target.value as any)} className="rounded border border-slate-700/50 bg-slate-800/50 px-1 py-0.5 text-[9px] text-slate-300 outline-none">
                    <option value="">Manual & Algo</option>
                    <option value="manual">Manual Only</option>
                    <option value="algo">Algo Only</option>
                  </select>
                  {(strategies ?? []).length > 0 && (
                    <select value={filterStrategy} onChange={e => setFilterStrategy(e.target.value ? Number(e.target.value) : "")} className="rounded border border-slate-700/50 bg-slate-800/50 px-1 py-0.5 text-[9px] text-slate-300 outline-none max-w-[80px]">
                      <option value="">All Strategies</option>
                      {(strategies ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                  <div className="flex items-center gap-1 border-l border-slate-700 pl-1.5">
                    <Layers size={9} className="text-slate-500" />
                    <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)} className="rounded border border-slate-700/50 bg-slate-800/50 px-1 py-0.5 text-[9px] text-slate-300 outline-none">
                      <option value="">No Grouping</option>
                      <option value="symbol">By Symbol</option>
                      <option value="strategy">By Strategy</option>
                      <option value="side">By Side</option>
                      <option value="date">By Date</option>
                    </select>
                  </div>
                  {hasActiveFilter && (
                    <button onClick={clearFilters} className="rounded p-0.5 text-slate-500 hover:text-red-400 transition-colors" title="Clear filters">
                      <X size={10} />
                    </button>
                  )}
                </div>

                <div className="ml-auto flex items-center gap-1.5">
                  <span className="text-[9px] text-slate-500 font-mono">
                    {bottomTab === "orders" ? filteredOrders.length : bottomTab === "trades" ? filteredTrades.length : livePositions.length}
                  </span>
                  <button onClick={refreshData} className="rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors" title="Refresh">
                    <RefreshCw size={10} />
                  </button>
                  <button onClick={handleResetAccount} className="rounded p-0.5 text-slate-500 hover:bg-red-950 hover:text-red-400" title="Reset account">
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto [scrollbar-width:thin]">
              {/* ═══ ORDERS TAB ═══ */}
              {bottomTab === "orders" && (
                filteredOrders.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">{orders.length === 0 ? "No orders yet" : "No orders match filters"}</div>
                ) : (() => {
                  const groups = groupItems(filteredOrders, groupBy);
                  return Object.entries(groups).map(([gKey, gOrders]) => (
                    <div key={gKey || "__all"}>
                      {gKey && (
                        <div className="sticky top-0 z-[9] flex items-center gap-2 bg-slate-900/95 px-3 py-1 border-b border-slate-700/50">
                          <Layers size={9} className="text-indigo-400" />
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">{gKey}</span>
                          <span className="text-[9px] text-slate-500 font-mono">{gOrders.length}</span>
                        </div>
                      )}
                      <table className="w-full text-left text-[10px]">
                        <thead className="sticky top-0 z-10 bg-slate-950">
                          <tr className="border-b border-slate-700">
                            <th className="px-3 py-1.5 text-slate-400 font-medium">Date & Time</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium">Symbol</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium">Source</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium">Strategy</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium">Side</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium">Type</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium text-right">Qty</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium text-right">Price</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium text-right">Filled</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium">Status</th>
                            <th className="px-2 py-1.5"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {gOrders.map((o) => {
                            const dt = fmtDateTime(o.created_at);
                            const sName = strategyName(o.strategy_id);
                            return (
                              <tr key={o.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                                <td className="px-3 py-1.5">
                                  <div className="font-mono text-[10px] text-slate-300">{dt.date}</div>
                                  <div className="font-mono text-[9px] text-slate-500">{dt.time}</div>
                                </td>
                                <td className="px-2 py-1.5 font-semibold text-slate-200">{o.symbol}</td>
                                <td className="px-2 py-1.5">
                                  <span className={cn(
                                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase",
                                    o.strategy_id ? "bg-violet-500/10 text-violet-400" : "bg-sky-500/10 text-sky-400"
                                  )}>
                                    {o.strategy_id ? <><Bot size={8} /> Algo</> : <><User size={8} /> Manual</>}
                                  </span>
                                </td>
                                <td className="px-2 py-1.5 text-[9px] text-slate-400 max-w-[80px] truncate" title={sName ?? "—"}>
                                  {sName ?? "—"}
                                </td>
                                <td className={cn("px-2 py-1.5 font-semibold", o.side === "BUY" ? "text-emerald-400" : "text-red-400")}>{o.side}</td>
                                <td className="px-2 py-1.5 text-slate-400">{o.order_type}</td>
                                <td className="px-2 py-1.5 font-mono text-slate-400 text-right">{o.quantity}</td>
                                <td className="px-2 py-1.5 font-mono text-slate-400 text-right">{o.price ? `₹${o.price.toFixed(2)}` : "MKT"}</td>
                                <td className="px-2 py-1.5 font-mono text-slate-300 text-right">{o.filled_price ? `₹${o.filled_price.toFixed(2)}` : "—"}</td>
                                <td className="px-2 py-1.5">
                                  <span className={cn(
                                    "rounded px-1.5 py-0.5 text-[9px] font-semibold",
                                    o.status === "FILLED" && "bg-emerald-500/10 text-emerald-400",
                                    o.status === "PENDING" && "bg-amber-500/10 text-amber-400",
                                    o.status === "CANCELLED" && "bg-slate-500/10 text-slate-400",
                                    o.status === "REJECTED" && "bg-red-500/10 text-red-400",
                                  )}>
                                    {o.status}
                                  </span>
                                </td>
                                <td className="px-2 py-1.5">
                                  {o.status === "PENDING" && (
                                    <button onClick={() => handleCancelOrder(o.id)} className="rounded p-0.5 text-slate-400 hover:text-red-400 transition-colors">
                                      <X size={12} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ));
                })()
              )}

              {/* ═══ TRADES TAB ═══ */}
              {bottomTab === "trades" && (
                filteredTrades.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">{trades.length === 0 ? "No trades yet" : "No trades match filters"}</div>
                ) : (() => {
                  const groups = groupItems(filteredTrades as any, groupBy);
                  return Object.entries(groups).map(([gKey, gTrades]) => (
                    <div key={gKey || "__all"}>
                      {gKey && (
                        <div className="sticky top-0 z-[9] flex items-center gap-2 bg-slate-900/95 px-3 py-1 border-b border-slate-700/50">
                          <Layers size={9} className="text-indigo-400" />
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">{gKey}</span>
                          <span className="text-[9px] text-slate-500 font-mono">{gTrades.length}</span>
                          {(() => {
                            const groupPnl = (gTrades as any[]).reduce((s: number, t: any) => s + (t.pnl || 0), 0);
                            return groupPnl !== 0 ? (
                              <span className={cn("text-[9px] font-mono font-bold ml-auto", groupPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                                P&L: {groupPnl >= 0 ? "+" : ""}₹{groupPnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      )}
                      <table className="w-full text-left text-[10px]">
                        <thead className="sticky top-0 z-10 bg-slate-950">
                          <tr className="border-b border-slate-700">
                            <th className="px-3 py-1.5 text-slate-400 font-medium">Date & Time</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium">Symbol</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium">Source</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium">Strategy</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium">Side</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium">Type</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium text-right">Qty</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium text-right">Price</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium text-right">P&L</th>
                            <th className="px-2 py-1.5 text-slate-400 font-medium text-right">Comm.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(gTrades as Trade[]).map((t) => {
                            const dt = fmtDateTime(t.executed_at);
                            const sName = strategyName(t.strategy_id);
                            return (
                              <tr key={t.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                                <td className="px-3 py-1.5">
                                  <div className="font-mono text-[10px] text-slate-300">{dt.date}</div>
                                  <div className="font-mono text-[9px] text-slate-500">{dt.time}</div>
                                </td>
                                <td className="px-2 py-1.5 font-semibold text-slate-200">{t.symbol}</td>
                                <td className="px-2 py-1.5">
                                  <span className={cn(
                                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase",
                                    t.strategy_id ? "bg-violet-500/10 text-violet-400" : "bg-sky-500/10 text-sky-400"
                                  )}>
                                    {t.strategy_id ? <><Bot size={8} /> Algo</> : <><User size={8} /> Manual</>}
                                  </span>
                                </td>
                                <td className="px-2 py-1.5 text-[9px] text-slate-400 max-w-[80px] truncate" title={sName ?? "—"}>
                                  {sName ?? "—"}
                                </td>
                                <td className={cn("px-2 py-1.5 font-semibold", t.side === "BUY" ? "text-emerald-400" : "text-red-400")}>{t.side}</td>
                                <td className="px-2 py-1.5 text-slate-400">{t.order_type ?? "—"}</td>
                                <td className="px-2 py-1.5 font-mono text-slate-400 text-right">{t.quantity}</td>
                                <td className="px-2 py-1.5 font-mono text-slate-300 text-right">₹{t.price.toFixed(2)}</td>
                                <td className={cn("px-2 py-1.5 font-mono font-semibold text-right", t.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                                  {t.pnl !== 0 ? `${t.pnl >= 0 ? "+" : ""}₹${t.pnl.toFixed(0)}` : "—"}
                                </td>
                                <td className="px-2 py-1.5 font-mono text-slate-500 text-right">₹{t.commission.toFixed(0)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ));
                })()
              )}

              {/* ═══ RESULTS TAB ═══ */}
              {bottomTab === "results" && (() => {
                const winners = livePositions.filter(p => p.unrealized_pnl > 0);
                const losers = livePositions.filter(p => p.unrealized_pnl < 0);
                const totalInvested = livePositions.reduce((s, p) => s + p.avg_price * p.quantity, 0);
                const totalMktValue = livePositions.reduce((s, p) => s + p.ltp * p.quantity, 0);
                const totalPnl = totalMktValue - totalInvested;
                const bestStock = [...livePositions].sort((a, b) => (b.unrealized_pnl_pct ?? 0) - (a.unrealized_pnl_pct ?? 0))[0];
                const worstStock = [...livePositions].sort((a, b) => (a.unrealized_pnl_pct ?? 0) - (b.unrealized_pnl_pct ?? 0))[0];

                // Group trades by strategy for strategy-level results
                const tradesByStrategy: Record<string, Trade[]> = {};
                for (const t of trades) {
                  const sn = strategyName(t.strategy_id) ?? "Manual";
                  if (!tradesByStrategy[sn]) tradesByStrategy[sn] = [];
                  tradesByStrategy[sn].push(t);
                }

                // Compute total realized P&L from trades
                const totalRealizedPnl = trades.reduce((s, t) => s + t.pnl, 0);
                const totalCommission = trades.reduce((s, t) => s + t.commission, 0);

                return livePositions.length === 0 && trades.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                    <BarChart3 size={32} className="mb-2 text-slate-600" />
                    <div className="text-xs font-medium">No strategy results yet</div>
                    <div className="text-[10px] text-slate-600 mt-1">Run a strategy to see performance analytics here</div>
                  </div>
                ) : (
                  <div className="p-4 space-y-4">
                    {/* Performance Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-slate-100">Performance Summary</h3>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {livePositions.length} positions · {trades.length} trades · {Object.keys(tradesByStrategy).length} strategies
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider">Unrealized</div>
                          <div className={cn("font-mono text-sm font-bold", totalPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {totalPnl >= 0 ? "+" : ""}₹{totalPnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-slate-500 uppercase tracking-wider">Realized</div>
                          <div className={cn("font-mono text-sm font-bold", totalRealizedPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {totalRealizedPnl >= 0 ? "+" : ""}₹{totalRealizedPnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-8 gap-2">
                      {[
                        { label: "Win Rate", value: livePositions.length > 0 ? `${((winners.length / livePositions.length) * 100).toFixed(0)}%` : "—", color: "text-emerald-400" },
                        { label: "Winners", value: String(winners.length), color: "text-emerald-400" },
                        { label: "Losers", value: String(losers.length), color: "text-red-400" },
                        { label: "Best", value: bestStock ? `${bestStock.symbol}` : "—", sub: bestStock ? `${(bestStock.unrealized_pnl_pct ?? 0).toFixed(1)}%` : "", color: "text-emerald-400" },
                        { label: "Worst", value: worstStock ? `${worstStock.symbol}` : "—", sub: worstStock ? `${(worstStock.unrealized_pnl_pct ?? 0).toFixed(1)}%` : "", color: "text-red-400" },
                        { label: "Avg P&L", value: livePositions.length > 0 ? `₹${(totalPnl / livePositions.length).toFixed(0)}` : "—", color: totalPnl >= 0 ? "text-emerald-400" : "text-red-400" },
                        { label: "Total Trades", value: String(trades.length), color: "text-slate-300" },
                        { label: "Commission", value: `₹${totalCommission.toFixed(0)}`, color: "text-amber-400" },
                      ].map((kpi) => (
                        <div key={kpi.label} className="rounded-lg border border-slate-800 bg-slate-900/50 px-2.5 py-1.5">
                          <div className="text-[8px] font-semibold uppercase tracking-wider text-slate-500">{kpi.label}</div>
                          <div className={cn("font-mono text-xs font-bold mt-0.5", kpi.color)}>{kpi.value}</div>
                          {"sub" in kpi && kpi.sub && <div className={cn("font-mono text-[9px]", kpi.color)}>{kpi.sub}</div>}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* P&L by Stock */}
                      <div className="rounded-lg border border-slate-800 p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">P&L by Stock</div>
                        <div className="space-y-1.5">
                          {[...livePositions]
                            .sort((a, b) => b.unrealized_pnl - a.unrealized_pnl)
                            .map(p => {
                              const maxAbsPnl = Math.max(...livePositions.map(x => Math.abs(x.unrealized_pnl)), 1);
                              const barWidth = Math.abs(p.unrealized_pnl) / maxAbsPnl * 100;
                              return (
                                <div key={p.id} className="flex items-center gap-2">
                                  <span className="w-16 text-[10px] font-semibold text-slate-300 truncate">{p.symbol}</span>
                                  <div className="flex-1 h-3.5 bg-slate-800/50 rounded overflow-hidden">
                                    <div
                                      className={cn("h-full rounded", p.unrealized_pnl >= 0 ? "bg-emerald-500/40" : "bg-red-500/40")}
                                      style={{ width: `${Math.max(barWidth, 2)}%` }}
                                    />
                                  </div>
                                  <span className={cn("w-14 text-right font-mono text-[9px] font-bold", p.unrealized_pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                                    {p.unrealized_pnl >= 0 ? "+" : ""}₹{Math.abs(p.unrealized_pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                  </span>
                                </div>
                              );
                          })}
                        </div>
                      </div>

                      {/* P&L by Strategy */}
                      <div className="rounded-lg border border-slate-800 p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">P&L by Strategy</div>
                        <div className="space-y-1.5">
                          {Object.entries(tradesByStrategy).map(([sn, sTrades]) => {
                            const sPnl = sTrades.reduce((s, t) => s + t.pnl, 0);
                            const sComm = sTrades.reduce((s, t) => s + t.commission, 0);
                            return (
                              <div key={sn} className="flex items-center justify-between rounded bg-slate-800/30 px-2.5 py-1.5">
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    {sn === "Manual" ? <User size={9} className="text-sky-400" /> : <Bot size={9} className="text-violet-400" />}
                                    <span className="text-[10px] font-semibold text-slate-200">{sn}</span>
                                  </div>
                                  <div className="text-[9px] text-slate-500 mt-0.5">{sTrades.length} trades · ₹{sComm.toFixed(0)} comm.</div>
                                </div>
                                <div className={cn("font-mono text-xs font-bold", sPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                                  {sPnl >= 0 ? "+" : ""}₹{sPnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                </div>
                              </div>
                            );
                          })}
                          {Object.keys(tradesByStrategy).length === 0 && (
                            <div className="text-[10px] text-slate-500 text-center py-2">No trade data yet</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </Panel>
        </ResizableGroup>
      </Panel>

      <CollapsibleChatPanel
        title="Paper Trade AI"
        placeholder="e.g. Should I add to my RELIANCE position?"
        tab="paper-trade"
        defaultSize={25}
        minSize={10}
        maxSize={50}
      />

      {/* Strategy change confirmation modal */}
      {strategyChangeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative w-full max-w-xs rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-100 mb-2">Change Strategy</h3>
            <p className="text-[11px] text-slate-400 mb-4">
              Switch <span className="font-semibold text-slate-200">{strategyChangeConfirm.symbol}</span> from{" "}
              <span className="font-semibold text-slate-300">
                {(strategies ?? []).find(s => String(s.id) === String(strategyChangeConfirm.oldStrategyId))?.name ?? "None"}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-indigo-400">
                {(strategies ?? []).find(s => String(s.id) === String(strategyChangeConfirm.newStrategyId))?.name ?? "None"}
              </span>?
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setStrategyChangeConfirm(null)}
                className="rounded px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setSymbolStrategies(prev => ({ ...prev, [strategyChangeConfirm.symbol]: strategyChangeConfirm.newStrategyId }));
                  setStrategyChangeConfirm(null);
                }}
                className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Buy modal */}
      {showManualBuy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <button
              onClick={() => setShowManualBuy(false)}
              className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-slate-800"
            >
              <X size={16} />
            </button>
            <h3 className="text-sm font-bold text-slate-100 mb-4">Manual Buy</h3>

            {/* Search & select stock */}
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Search Stock</label>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={manualBuySearch}
                    onChange={(e) => {
                      setManualBuySearch(e.target.value.toUpperCase());
                      if (e.target.value.length >= 2) setManualBuySymbol("");
                    }}
                    placeholder="Type symbol name..."
                    className="w-full rounded-md border border-slate-700 bg-slate-800 py-2 pl-8 pr-3 text-xs text-slate-300 outline-none focus:border-indigo-500"
                    autoFocus
                  />
                </div>
                {manualBuySearch.length >= 1 && !manualBuySymbol && (
                  <div className="mt-1 max-h-32 overflow-auto rounded border border-slate-700 bg-slate-800 [scrollbar-width:thin]">
                    {batchSymbols
                      .filter(s => s.toUpperCase().includes(manualBuySearch))
                      .slice(0, 10)
                      .map(sym => (
                        <button
                          key={sym}
                          onClick={() => {
                            setManualBuySymbol(sym);
                            setManualBuySearch(sym);
                          }}
                          className="flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-700 transition-colors"
                        >
                          <span className="font-semibold text-slate-200">{sym}</span>
                          {prices[sym] && (
                            <span className="font-mono text-slate-400">₹{prices[sym].ltp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          )}
                        </button>
                      ))}
                    {batchSymbols.filter(s => s.toUpperCase().includes(manualBuySearch)).length === 0 && (
                      <div className="px-3 py-2 text-[10px] text-slate-500">
                        No matches in batch. You can type the exact symbol and proceed.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Selected stock info */}
              {(manualBuySymbol || (manualBuySearch.length >= 2 && !manualBuySymbol)) && (() => {
                const sym = manualBuySymbol || manualBuySearch;
                const ltp = prices[sym]?.ltp ?? 0;
                const cash = portfolio?.cash_balance ?? 0;
                const totalCost = manualBuyType === "MARKET" ? ltp * manualBuyQty : (manualBuyPrice ?? 0) * manualBuyQty;
                const maxQty = ltp > 0 ? Math.floor(cash / ltp) : 0;

                return (
                  <>
                    {ltp > 0 && (
                      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-bold text-slate-100">{sym}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">LTP: <span className="font-mono text-slate-300">₹{ltp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                          </div>
                          <div className="text-right">
                            <div className="text-[9px] text-slate-500">Available Cash</div>
                            <div className="font-mono text-xs font-bold text-blue-400">₹{cash.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Order Type</label>
                        <select
                          value={manualBuyType}
                          onChange={(e) => setManualBuyType(e.target.value as "MARKET" | "LIMIT")}
                          className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-indigo-500"
                        >
                          <option value="MARKET">Market</option>
                          <option value="LIMIT">Limit</option>
                        </select>
                      </div>
                      {manualBuyType === "LIMIT" && (
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Limit Price</label>
                          <input
                            type="number"
                            value={manualBuyPrice ?? ""}
                            onChange={(e) => setManualBuyPrice(Number(e.target.value))}
                            step={0.05}
                            placeholder={ltp > 0 ? ltp.toFixed(2) : "0.00"}
                            className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs font-mono text-slate-300 outline-none focus:border-indigo-500"
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Quantity</label>
                        {ltp > 0 && <span className="text-[9px] text-slate-500">Max: {maxQty.toLocaleString("en-IN")}</span>}
                      </div>
                      <input
                        type="number"
                        value={manualBuyQty}
                        onChange={(e) => setManualBuyQty(Math.max(1, Number(e.target.value)))}
                        min={1}
                        className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs font-mono text-slate-300 outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Cost summary */}
                    <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-3 space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500">Estimated Cost</span>
                        <span className="font-mono font-bold text-slate-200">₹{totalCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500">Remaining Cash</span>
                        <span className={cn("font-mono font-bold", cash - totalCost >= 0 ? "text-emerald-400" : "text-red-400")}>
                          ₹{(cash - totalCost).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      {totalCost > cash && (
                        <div className="text-[9px] text-red-400 mt-1">Insufficient funds</div>
                      )}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setShowManualBuy(false)}
                        className="flex-1 rounded-md border border-slate-700 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={manualBuyLoading || totalCost <= 0 || totalCost > cash || !sym}
                        onClick={async () => {
                          setManualBuyLoading(true);
                          try {
                            await apiPost("/paper/orders", {
                              account_id: accountId,
                              symbol: sym.toUpperCase(),
                              side: "BUY",
                              quantity: manualBuyQty,
                              order_type: manualBuyType,
                              price: manualBuyType === "LIMIT" ? manualBuyPrice : (prices[sym]?.ltp ?? undefined),
                            });
                            refreshData();
                            refetchAccounts();
                            setShowManualBuy(false);
                          } catch { /* ignore */ }
                          setManualBuyLoading(false);
                        }}
                        className="flex-1 rounded-md bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {manualBuyLoading ? "Placing..." : `Buy ${sym}`}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Create account modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="relative w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <button
              onClick={() => setShowCreate(false)}
              className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X size={16} />
            </button>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Create Paper Account</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Account Name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Starting Balance (₹)</label>
                <input
                  type="number"
                  value={createBalance}
                  onChange={(e) => setCreateBalance(Number(e.target.value))}
                  min={1000}
                  step={10000}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                />
              </div>
              <button
                onClick={handleCreateAccount}
                className="w-full rounded-md bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                Create Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Stocks Modal */}
      {showAddStocks && (() => {
        const currentBatch = (batches ?? []).find(b => b.id === selectedBatchId);
        const batchName = currentBatch?.name ?? "Unknown";
        const batchStocks = currentBatch?.symbols ?? [];
        const filtered = batchStocks.filter(sym =>
          !addStocksSearch || sym.toUpperCase().includes(addStocksSearch.toUpperCase())
        );
        const allFilteredSelected = filtered.length > 0 && filtered.every(sym => addStocksSelected.has(sym));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="relative flex w-full max-w-lg flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl" style={{ maxHeight: "70vh" }}>
              <button
                onClick={() => setShowAddStocks(false)}
                className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-slate-800"
              >
                <X size={16} />
              </button>

              <div className="px-5 pt-5 pb-3">
                <h3 className="text-base font-semibold text-slate-100">Add Stocks</h3>
                <div className="mt-1 text-xs text-slate-400">Batch: {batchName}</div>

                <div className="relative mt-3">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={addStocksSearch}
                    onChange={(e) => setAddStocksSearch(e.target.value.toUpperCase())}
                    placeholder="Search stocks..."
                    className="w-full rounded border border-slate-700 bg-slate-800 py-1.5 pl-8 pr-3 text-xs text-slate-300 outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={() => {
                        setAddStocksSelected(prev => {
                          const next = new Set(prev);
                          if (allFilteredSelected) {
                            filtered.forEach(sym => next.delete(sym));
                          } else {
                            filtered.forEach(sym => next.add(sym));
                          }
                          return next;
                        });
                      }}
                      className="rounded border-slate-600 bg-slate-800 text-indigo-600"
                    />
                    Select All
                  </label>
                  <span className="text-xs text-slate-500">Selected: {addStocksSelected.size}</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto border-t border-slate-800 px-2 [scrollbar-width:thin]">
                {filtered.map(sym => {
                  const tick = prices[sym];
                  return (
                    <label
                      key={sym}
                      className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-xs transition-colors hover:bg-slate-800/50"
                    >
                      <input
                        type="checkbox"
                        checked={addStocksSelected.has(sym)}
                        onChange={() => {
                          setAddStocksSelected(prev => {
                            const next = new Set(prev);
                            if (next.has(sym)) next.delete(sym); else next.add(sym);
                            return next;
                          });
                        }}
                        className="rounded border-slate-600 bg-slate-800 text-indigo-600"
                      />
                      <span className="flex-1 font-semibold text-slate-200">{sym}</span>
                      {tick && (
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-slate-400">₹{tick.ltp.toFixed(1)}</span>
                          <span className={cn("font-mono w-12 text-right", tick.change_pct >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {tick.change_pct >= 0 ? "+" : ""}{tick.change_pct.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </label>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="py-6 text-center text-xs text-slate-500">No matching stocks</div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
                <button
                  onClick={() => setShowAddStocks(false)}
                  className="rounded px-4 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const next = Array.from(addStocksSelected).sort();
                    setTradableSymbols(next);
                    saveAccountConfig({ tradable_symbols: next });
                    setShowAddStocks(false);
                  }}
                  className="rounded bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Add Selected ({addStocksSelected.size})
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Batch Change Confirmation */}
      {pendingBatchChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle size={18} />
              <h3 className="text-sm font-semibold">Change Watchlist?</h3>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {pendingBatchChange.invalidSymbols.length} selected stock{pendingBatchChange.invalidSymbols.length > 1 ? "s are" : " is"} not present in the new batch:
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {pendingBatchChange.invalidSymbols.map(sym => (
                <span key={sym} className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-400">{sym}</span>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              These stocks will be removed from your tradable list. Common stocks will be kept.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setPendingBatchChange(null)}
                className="rounded px-4 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const newBatch = (batches ?? []).find(b => b.id === pendingBatchChange.newBatchId);
                  const newBatchSyms = new Set(newBatch?.symbols ?? []);
                  const kept = tradableSymbols.filter(s => newBatchSyms.has(s));
                  setSelectedBatchId(pendingBatchChange.newBatchId);
                  setTradableSymbols(kept);
                  saveAccountConfig({ batch_id: pendingBatchChange.newBatchId, tradable_symbols: kept });
                  setPendingBatchChange(null);
                }}
                className="rounded bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
              >
                Change Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Run Strategy Modal */}
      {showRunStrategy && (() => {
        const acc = (accounts ?? []).find(a => a.id === accountId);
        const baseCash = acc?.cash_balance ?? 0;
        const cashAvailable = baseCash + runAddCash;
        const strategyName = (strategies ?? []).find(s => String(s.id) === String(selectedStrategyId))?.name ?? "—";
        const totalAllocated = Object.values(runAllocations).reduce((s, a) => s + (a.capital || 0), 0);
        const capitalUsedPct = cashAvailable > 0 ? (runCapital / cashAvailable) * 100 : 0;
        const unallocated = runCapital - totalAllocated;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="relative flex w-full max-w-2xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl" style={{ maxHeight: "85vh" }}>
              <button
                onClick={() => setShowRunStrategy(false)}
                className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-slate-800 z-10"
              >
                <X size={16} />
              </button>

              {/* Header */}
              <div className="px-6 pt-5 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-emerald-600/20 p-2">
                    <Zap size={18} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-100">Run Strategy</h3>
                    <div className="text-xs text-slate-500">Configure capital & risk before the algorithm starts</div>
                  </div>
                </div>

                {/* Account summary cards */}
                <div className="mt-4 grid grid-cols-4 gap-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Account</div>
                    <div className="mt-0.5 text-sm font-semibold text-slate-200 truncate">{acc?.name ?? "—"}</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Cash Balance</div>
                    <div className="mt-0.5 text-sm font-bold font-mono text-emerald-400">₹{baseCash.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Strategy</div>
                    <div className="mt-0.5 text-sm font-semibold text-indigo-400 truncate">{strategyName}</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Stocks</div>
                    <div className="mt-0.5 text-sm font-semibold text-slate-200">{tradableSymbols.length}</div>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 [scrollbar-width:thin]">

                {/* Add Cash */}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Add Cash to Account</div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">₹</span>
                      <input
                        type="number"
                        value={runAddCash || ""}
                        onChange={(e) => {
                          const v = Math.max(0, Number(e.target.value));
                          setRunAddCash(v);
                          setRunCapital(baseCash + v);
                        }}
                        placeholder="0"
                        className="w-full rounded border border-slate-700 bg-slate-800 pl-7 pr-3 py-2 text-sm font-mono text-slate-200 outline-none focus:border-indigo-500"
                      />
                    </div>
                    {[50000, 100000, 500000].map(amt => (
                      <button
                        key={amt}
                        onClick={() => {
                          setRunAddCash(amt);
                          setRunCapital(baseCash + amt);
                        }}
                        className={cn(
                          "rounded px-2 py-1.5 text-[10px] font-semibold transition-colors whitespace-nowrap",
                          runAddCash === amt
                            ? "bg-indigo-600 text-white"
                            : "border border-slate-700 text-slate-400 hover:bg-slate-800"
                        )}
                      >
                        +₹{(amt / 1000).toFixed(0)}K
                      </button>
                    ))}
                  </div>
                  {runAddCash > 0 && (
                    <div className="mt-1.5 text-[10px] text-emerald-400">
                      Total available: ₹{baseCash.toLocaleString("en-IN", { maximumFractionDigits: 0 })} + ₹{runAddCash.toLocaleString("en-IN", { maximumFractionDigits: 0 })} = ₹{cashAvailable.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </div>
                  )}
                </div>

                {/* Capital Allocation */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Deploy Capital</div>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-mono text-slate-400">₹</span>
                      <input
                        type="number"
                        value={runCapital || ""}
                        onChange={(e) => setRunCapital(Math.max(0, Math.min(cashAvailable, Number(e.target.value))))}
                        placeholder="0"
                        className="w-28 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-right text-sm font-mono font-bold text-slate-200 outline-none focus:border-indigo-500"
                      />
                      <span className="text-[10px] font-normal text-slate-500">/ ₹{cashAvailable.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={cashAvailable}
                    step={Math.max(1, Math.round(cashAvailable / 1000))}
                    value={runCapital}
                    onChange={(e) => setRunCapital(Number(e.target.value))}
                    className="w-full h-2 appearance-none rounded-full cursor-pointer bg-slate-800 accent-emerald-500 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-lg"
                  />
                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                    <span>{capitalUsedPct.toFixed(0)}% of cash</span>
                    <span>₹{(cashAvailable - runCapital).toLocaleString("en-IN", { maximumFractionDigits: 0 })} remains</span>
                  </div>
                </div>

                {/* Distribution toggle */}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Allocation</div>
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => setRunDistribution("auto")}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-all text-left",
                        runDistribution === "auto"
                          ? "border-indigo-500 bg-indigo-600/10 text-indigo-300"
                          : "border-slate-700 text-slate-400 hover:bg-slate-800"
                      )}
                    >
                      <div>Auto</div>
                      <div className="text-[10px] font-normal text-slate-500 mt-0.5">Smart equal split, skips expensive</div>
                    </button>
                    <button
                      onClick={() => {
                        setRunDistribution("custom");
                        if (Object.keys(runAllocations).length === 0) {
                          const perStock = tradableSymbols.length > 0 ? Math.floor(runCapital / tradableSymbols.length) : 0;
                          const allocs: Record<string, { capital: number; qty: number }> = {};
                          tradableSymbols.forEach(sym => {
                            const ltp = prices[sym]?.ltp ?? 0;
                            allocs[sym] = { capital: perStock, qty: ltp > 0 ? Math.floor(perStock / ltp) : 0 };
                          });
                          setRunAllocations(allocs);
                        }
                      }}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-all text-left",
                        runDistribution === "custom"
                          ? "border-indigo-500 bg-indigo-600/10 text-indigo-300"
                          : "border-slate-700 text-slate-400 hover:bg-slate-800"
                      )}
                    >
                      <div>Custom</div>
                      <div className="text-[10px] font-normal text-slate-500 mt-0.5">Edit capital & qty per stock</div>
                    </button>
                  </div>

                  {/* Auto mode */}
                  {runDistribution === "auto" && (() => {
                    const sorted = [...tradableSymbols].sort();
                    const perStock = sorted.length > 0 ? runCapital / sorted.length : 0;

                    // Pass 1: find stocks too expensive
                    const expensive = new Set<string>();
                    sorted.forEach(sym => {
                      const ltp = prices[sym]?.ltp ?? 0;
                      if (ltp > 0 && perStock < ltp) expensive.add(sym);
                    });

                    // Pass 2: redistribute to affordable stocks
                    const affordable = sorted.filter(s => !expensive.has(s));
                    const perAffordable = affordable.length > 0 ? runCapital / affordable.length : 0;

                    // Pass 3: check again after redistribution (edge case)
                    const stillExpensive = new Set(expensive);
                    affordable.forEach(sym => {
                      const ltp = prices[sym]?.ltp ?? 0;
                      if (ltp > 0 && perAffordable < ltp) stillExpensive.add(sym);
                    });
                    const finalAffordable = sorted.filter(s => !stillExpensive.has(s));
                    const finalPerStock = finalAffordable.length > 0 ? runCapital / finalAffordable.length : 0;

                    let autoAllocated = 0;

                    return (
                      <div className="rounded-lg border border-slate-800 overflow-hidden">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="bg-slate-950/50">
                              <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Stock</th>
                              <th className="px-2 py-1.5 text-right text-[10px] font-medium text-slate-500">LTP</th>
                              <th className="px-2 py-1.5 text-right text-[10px] font-medium text-slate-500">Qty</th>
                              <th className="px-2 py-1.5 text-right text-[10px] font-medium text-slate-500">Capital</th>
                              <th className="px-2 py-1.5 text-right text-[10px] font-medium text-slate-500">Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sorted.map(sym => {
                              const ltp = prices[sym]?.ltp ?? 0;
                              const isSkipped = stillExpensive.has(sym);
                              const capital = isSkipped ? 0 : finalPerStock;
                              const qty = ltp > 0 ? Math.floor(capital / ltp) : 0;
                              const value = qty * ltp;
                              autoAllocated += value;

                              return (
                                <tr key={sym} className={cn("border-t border-slate-800/50", isSkipped ? "bg-red-950/10" : "hover:bg-slate-800/30")}>
                                  <td className="px-3 py-1.5">
                                    <div className={cn("font-semibold", isSkipped ? "text-slate-500" : "text-slate-200")}>{sym}</div>
                                    {isSkipped && (
                                      <div className="text-[9px] text-amber-500">LTP ₹{ltp.toLocaleString("en-IN", { maximumFractionDigits: 0 })} — skipped, funds moved to others</div>
                                    )}
                                  </td>
                                  <td className={cn("px-2 py-1.5 text-right font-mono", isSkipped ? "text-red-400/70" : "text-slate-400")}>
                                    ₹{ltp.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono">
                                    {isSkipped ? <span className="text-slate-600">0</span> : <span className="text-slate-300">{qty}</span>}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono">
                                    {isSkipped ? <span className="text-slate-600">—</span> : <span className="text-slate-300">₹{capital.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono text-slate-500">
                                    {value > 0 ? `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <table className="w-full text-[11px]">
                          <tbody>
                            <tr className="border-t border-slate-700 bg-slate-950/50">
                              <td className="px-3 py-2 text-[10px] text-slate-500" colSpan={2}>
                                Unused: <span className="font-mono font-semibold text-slate-300">₹{(runCapital - autoAllocated).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                                {finalAffordable.length < sorted.length && (
                                  <span className="ml-3">Stocks: <span className="font-mono font-semibold text-slate-300">{finalAffordable.length}/{sorted.length}</span></span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-right text-[10px] text-slate-500" colSpan={2}>
                                Invested:
                              </td>
                              <td className="px-2 py-2 text-right text-[10px]">
                                <span className="font-mono font-semibold text-emerald-400">₹{autoAllocated.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        {stillExpensive.size > 0 && (
                          <div className="border-t border-amber-800/30 bg-amber-950/10 px-3 py-1.5">
                            <span className="text-[9px] text-amber-500">
                              {stillExpensive.size} stock{stillExpensive.size > 1 ? "s" : ""} too expensive — capital redistributed to {finalAffordable.length} affordable stock{finalAffordable.length > 1 ? "s" : ""}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Custom mode */}
                  {runDistribution === "custom" && (
                    <>
                      <div className="rounded-lg border border-slate-800 overflow-hidden">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="bg-slate-950/50">
                              <th className="px-3 py-1.5 text-left text-[10px] font-medium text-slate-500">Stock</th>
                              <th className="px-2 py-1.5 text-right text-[10px] font-medium text-slate-500">LTP</th>
                              <th className="px-2 py-1.5 text-right text-[10px] font-medium text-slate-500">Qty</th>
                              <th className="px-2 py-1.5 text-right text-[10px] font-medium text-slate-500">Capital (₹)</th>
                              <th className="px-2 py-1.5 text-right text-[10px] font-medium text-slate-500">Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...tradableSymbols].sort().map(sym => {
                              const ltp = prices[sym]?.ltp ?? 0;
                              const alloc = runAllocations[sym] ?? { capital: 0, qty: 0 };
                              const value = ltp * alloc.qty;
                              const cantAfford = ltp > 0 && alloc.capital > 0 && alloc.capital < ltp;

                              return (
                                <tr key={sym} className="border-t border-slate-800/50 hover:bg-slate-800/30">
                                  <td className="px-3 py-1.5">
                                    <div className="font-semibold text-slate-200">{sym}</div>
                                    {cantAfford && (
                                      <div className="text-[9px] text-amber-500">Min ₹{ltp.toLocaleString("en-IN", { maximumFractionDigits: 0 })} for 1 share</div>
                                    )}
                                  </td>
                                  <td className={cn("px-2 py-1.5 text-right font-mono", cantAfford ? "text-amber-400" : "text-slate-400")}>
                                    {ltp > 0 ? `₹${ltp.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—"}
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <input
                                      type="number"
                                      value={alloc.qty || ""}
                                      onChange={(e) => {
                                        const qty = Math.max(0, Math.floor(Number(e.target.value)));
                                        const cap = ltp > 0 ? Math.round(qty * ltp) : alloc.capital;
                                        setRunAllocations(prev => ({ ...prev, [sym]: { capital: cap, qty } }));
                                      }}
                                      placeholder="0"
                                      min={0}
                                      className="w-14 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-right text-[11px] font-mono text-slate-300 outline-none focus:border-indigo-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <input
                                      type="number"
                                      value={alloc.capital || ""}
                                      onChange={(e) => {
                                        const cap = Math.max(0, Number(e.target.value));
                                        const qty = ltp > 0 ? Math.floor(cap / ltp) : 0;
                                        setRunAllocations(prev => ({ ...prev, [sym]: { capital: cap, qty } }));
                                      }}
                                      placeholder="0"
                                      className={cn(
                                        "w-20 rounded border bg-slate-900 px-2 py-0.5 text-right text-[11px] font-mono outline-none focus:border-indigo-500",
                                        cantAfford ? "border-amber-600/50 text-amber-400" : "border-slate-700 text-slate-300"
                                      )}
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono text-slate-500">
                                    {value > 0 ? `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <table className="w-full text-[11px]">
                          <tbody>
                            <tr className="border-t border-slate-700 bg-slate-950/50">
                              <td className="px-3 py-2 text-[10px] text-slate-500" colSpan={2}>
                                Unallocated: <span className={cn("font-mono font-semibold", unallocated < 0 ? "text-red-400" : "text-slate-300")}>₹{unallocated.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                              </td>
                              <td className="px-2 py-2 text-right text-[10px] text-slate-500" colSpan={2}>
                                Allocated: <span className={cn("font-mono font-semibold", totalAllocated > runCapital ? "text-red-400" : "text-emerald-400")}>₹{totalAllocated.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                              </td>
                              <td className="px-2 py-2 text-right text-[10px] text-slate-500">
                                <span className={cn("font-mono font-semibold", totalAllocated > runCapital ? "text-red-400" : "text-emerald-400")}>₹{totalAllocated.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        {totalAllocated > runCapital && (
                          <div className="border-t border-red-800/30 bg-red-950/20 px-3 py-1.5">
                            <span className="text-[9px] text-red-400">Over-allocated by ₹{(totalAllocated - runCapital).toLocaleString("en-IN", { maximumFractionDigits: 0 })} — reduce capital or increase deploy amount</span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          const perStock = tradableSymbols.length > 0 ? Math.floor(runCapital / tradableSymbols.length) : 0;
                          const allocs: Record<string, { capital: number; qty: number }> = {};
                          tradableSymbols.forEach(sym => {
                            const ltp = prices[sym]?.ltp ?? 0;
                            allocs[sym] = { capital: perStock, qty: ltp > 0 ? Math.floor(perStock / ltp) : 0 };
                          });
                          setRunAllocations(allocs);
                        }}
                        className="mt-2 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        Split Equally
                      </button>
                    </>
                  )}
                </div>

                {/* Risk Parameters */}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Risk Management</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-500 mb-1 block">Stop Loss (%)</label>
                      <input
                        type="number"
                        value={runStopLoss}
                        onChange={(e) => setRunStopLoss(Math.max(0, Number(e.target.value)))}
                        step={0.5}
                        className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-mono text-red-400 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 mb-1 block">Target (%)</label>
                      <input
                        type="number"
                        value={runTarget}
                        onChange={(e) => setRunTarget(Math.max(0, Number(e.target.value)))}
                        step={0.5}
                        className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-mono text-emerald-400 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 mb-1 block">Max per Stock (%)</label>
                      <input
                        type="number"
                        value={runMaxPerStock}
                        onChange={(e) => setRunMaxPerStock(Math.max(1, Math.min(100, Number(e.target.value))))}
                        step={5}
                        className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-mono text-slate-300 outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] text-slate-600">
                    Max loss per trade: ₹{(runCapital * runStopLoss / 100 / tradableSymbols.length).toLocaleString("en-IN", { maximumFractionDigits: 0 })} &middot;
                    Risk:Reward = 1:{(runTarget / runStopLoss).toFixed(1)}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4">
                <div className="text-[10px] text-slate-500">
                  Allocated ₹{totalAllocated.toLocaleString("en-IN", { maximumFractionDigits: 0 })} across {tradableSymbols.length} stock{tradableSymbols.length > 1 ? "s" : ""}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowRunStrategy(false)}
                    className="rounded px-4 py-2 text-xs text-slate-400 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      setRunIsRunning(true);
                      setShowRunStrategy(false);

                      // Compute final allocations
                      let finalAllocs: Record<string, { capital: number; qty: number }> = {};
                      if (runDistribution === "custom") {
                        finalAllocs = { ...runAllocations };
                      } else {
                        // Auto: smart equal split
                        const sorted = [...tradableSymbols].sort();
                        const perStock = sorted.length > 0 ? runCapital / sorted.length : 0;
                        const expensive = new Set<string>();
                        sorted.forEach(sym => {
                          const ltp = prices[sym]?.ltp ?? 0;
                          if (ltp > 0 && perStock < ltp) expensive.add(sym);
                        });
                        const affordable = sorted.filter(s => !expensive.has(s));
                        const perAffordable = affordable.length > 0 ? runCapital / affordable.length : 0;
                        affordable.forEach(sym => {
                          const ltp = prices[sym]?.ltp ?? 0;
                          if (ltp > 0 && perAffordable >= ltp) {
                            const qty = Math.floor(perAffordable / ltp);
                            finalAllocs[sym] = { capital: perAffordable, qty };
                          }
                        });
                      }

                      // Place buy orders for each stock with qty > 0
                      const stratId = selectedStrategyId ? Number(selectedStrategyId) : undefined;
                      for (const [sym, alloc] of Object.entries(finalAllocs)) {
                        if (alloc.qty <= 0) continue;
                        try {
                          await apiPost("/paper/orders", {
                            account_id: accountId,
                            symbol: sym.toUpperCase(),
                            side: "BUY",
                            quantity: alloc.qty,
                            order_type: "MARKET",
                            price: prices[sym]?.ltp ?? undefined,
                            strategy_id: stratId,
                          });
                        } catch { /* continue with next */ }
                      }

                      // Assign strategy to each stock that was bought
                      if (stratId) {
                        const bought = Object.entries(finalAllocs).filter(([, a]) => a.qty > 0).map(([s]) => s);
                        setSymbolStrategies(prev => {
                          const next = { ...prev };
                          bought.forEach(s => { next[s] = stratId; });
                          return next;
                        });
                      }

                      // Clear strategy, batch, tradable stocks
                      setSelectedStrategyId("");
                      setSelectedBatchId("");
                      setTradableSymbols([]);
                      await saveAccountConfig({ strategy_id: null, batch_id: null, tradable_symbols: [] });

                      // Refresh data
                      await refreshData();
                      refetchAccounts();
                      setRunIsRunning(false);
                    }}
                    disabled={runCapital <= 0 || (runDistribution === "custom" && (totalAllocated <= 0 || totalAllocated > runCapital)) || (runDistribution === "auto" && tradableSymbols.length === 0)}
                    className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Play size={14} />
                    Start Strategy
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </ResizableGroup>
  );
}
