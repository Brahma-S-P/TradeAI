import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Zap, Plus, Play, Square, Trash2, Check, X, RefreshCw,
  ArrowUpCircle, ArrowDownCircle, Shield, AlertOctagon,
  TrendingUp, TrendingDown, Bot, Hand, Eye, Package,
} from "lucide-react";
import { ResizableGroup, Panel, ResizeHandle } from "@/components/panels/ResizablePanel";
import { CollapsibleChatPanel } from "@/components/panels/CollapsibleChatPanel";
import { useApi } from "@/lib/useApi";
import { apiFetch, apiPost } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StrategyItem { id: number; name: string; strategy_type: string; }
interface BatchItem { id: number; name: string; symbols: string[]; }

interface LiveSessionItem {
  id: number; name: string; strategy_id: number; strategy_name: string;
  batch_id: number | null; batch_name: string; symbols: string[];
  mode: string; status: string; product: string; per_trade_qty: number;
  max_positions: number; stoploss_pct: number; target_pct: number;
  daily_loss_limit: number; scan_interval_sec: number;
  trades_today: number; pnl_today: number;
  created_at: string | null;
}

interface LiveOrderItem {
  id: number; session_id: number; kite_order_id: string; symbol: string;
  side: string; order_type: string; quantity: number; price: number | null;
  trigger_price: number | null; status: string; kite_status: string;
  filled_price: number | null; pnl: number; signal_reason: string;
  needs_approval: boolean; approved: boolean | null;
  created_at: string | null;
}

interface KitePosition {
  symbol: string; quantity: number; avg_price: number; ltp: number;
  pnl: number; product: string; day_change: number;
}

interface KiteHolding {
  symbol: string; quantity: number; avg_price: number; ltp: number;
  pnl: number; day_change: number; day_change_pct: number;
}

interface Portfolio {
  connected: boolean;
  positions: KitePosition[];
  holdings: KiteHolding[];
  margins: { equity_available: number; equity_used: number };
  day_pnl: { realized: number; unrealized: number };
  error?: string;
}

interface PriceTick {
  type: string;
  data: Array<{ symbol: string; ltp: number; change_pct: number; volume: number }>;
}

type Tab = "positions" | "holdings" | "orders" | "sessions";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function LiveTrade() {
  // Data
  const { data: strategies } = useApi<StrategyItem[]>("/strategies");
  const { data: batches } = useApi<BatchItem[]>("/batches");
  const [sessions, setSessions] = useState<LiveSessionItem[]>([]);
  const [orders, setOrders] = useState<LiveOrderItem[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [prices, setPrices] = useState<Record<string, { ltp: number; change_pct: number }>>({});

  // UI state
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [activeTab, setActiveTab] = useState<Tab>("positions");
  const [showCreateSession, setShowCreateSession] = useState(false);

  // Manual order form
  const [orderSymbol, setOrderSymbol] = useState("");
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY");
  const [orderQty, setOrderQty] = useState(1);
  const [orderType, setOrderType] = useState("MARKET");
  const [orderPrice, setOrderPrice] = useState<number | undefined>();
  const [orderProduct, setOrderProduct] = useState("CNC");
  const [orderStoploss, setOrderStoploss] = useState<number | undefined>();
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderMsg, setOrderMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Session create form
  const [csName, setCsName] = useState("Live Session");
  const [csStrategyId, setCsStrategyId] = useState<number | "">("");
  const [csBatchId, setCsBatchId] = useState<number | "">("");
  const [csSelectedSyms, setCsSelectedSyms] = useState<string[]>([]);
  const [csMode, setCsMode] = useState<"manual" | "auto">("manual");
  const [csProduct, setCsProduct] = useState("CNC");
  const [csQty, setCsQty] = useState(1);
  const [csInterval, setCsInterval] = useState(60);
  const [csSL, setCsSL] = useState(3);
  const [csTarget, setCsTarget] = useState(6);
  const [csDailyLimit, setCsDailyLimit] = useState(10000);

  // WebSocket
  const { lastMessage: wsTick } = useWebSocket<PriceTick>(
    `ws://${window.location.hostname}:8000/ws/prices`
  );

  useEffect(() => {
    if (wsTick?.data) {
      setPrices(prev => {
        const next = { ...prev };
        for (const t of wsTick.data) next[t.symbol] = { ltp: t.ltp, change_pct: t.change_pct };
        return next;
      });
    }
  }, [wsTick]);

  // Polling
  const refreshData = useCallback(async () => {
    try {
      const [s, o, p] = await Promise.all([
        apiFetch<LiveSessionItem[]>("/live/sessions"),
        apiFetch<LiveOrderItem[]>("/live/orders?limit=100"),
        apiFetch<Portfolio>("/live/portfolio"),
      ]);
      setSessions(s);
      setOrders(o);
      setPortfolio(p);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshData();
    const id = setInterval(refreshData, 5000);
    return () => clearInterval(id);
  }, [refreshData]);

  // Batch symbols for session create
  const batchSymbols = useMemo(() => {
    if (!csBatchId || !batches) return [];
    const b = batches.find(x => x.id === csBatchId);
    return b?.symbols ?? [];
  }, [csBatchId, batches]);

  useEffect(() => {
    if (batchSymbols.length > 0) setCsSelectedSyms(batchSymbols);
  }, [batchSymbols]);

  // Live positions with WebSocket prices
  const livePositions = useMemo(() => {
    if (!portfolio?.positions) return [];
    return portfolio.positions.map(p => {
      const ws = prices[p.symbol];
      const ltp = ws?.ltp ?? p.ltp;
      const pnl = (ltp - p.avg_price) * p.quantity;
      return { ...p, ltp: Math.round(ltp * 100) / 100, pnl: Math.round(pnl * 100) / 100 };
    });
  }, [portfolio, prices]);

  const dayPnl = portfolio?.day_pnl ?? { realized: 0, unrealized: 0 };
  const totalPnl = dayPnl.realized + dayPnl.unrealized;
  const pendingApprovals = orders.filter(o => o.needs_approval && o.status === "PENDING");

  // Handlers
  async function handlePlaceOrder() {
    if (!orderSymbol.trim()) return;
    setOrderLoading(true);
    setOrderMsg(null);
    try {
      const res = await apiPost<{ status: string; order_id?: string; message?: string }>("/live/orders", {
        symbol: orderSymbol.toUpperCase(),
        side: orderSide,
        quantity: orderQty,
        order_type: orderType,
        price: orderType !== "MARKET" ? orderPrice : undefined,
        product: orderProduct,
        stoploss: orderStoploss,
      });
      if (res.status === "success") {
        setOrderMsg({ type: "success", text: `Order placed: ${res.order_id}` });
        refreshData();
      } else {
        setOrderMsg({ type: "error", text: res.message || "Failed" });
      }
    } catch (e) {
      setOrderMsg({ type: "error", text: e instanceof Error ? e.message : "Error" });
    }
    setOrderLoading(false);
  }

  async function handleCreateSession() {
    if (!csStrategyId) return;
    await apiPost("/live/sessions", {
      name: csName,
      strategy_id: csStrategyId,
      batch_id: csBatchId || undefined,
      symbols: csSelectedSyms,
      mode: csMode,
      product: csProduct,
      per_trade_qty: csQty,
      stoploss_pct: csSL,
      target_pct: csTarget,
      daily_loss_limit: csDailyLimit,
      scan_interval_sec: csInterval,
    });
    setShowCreateSession(false);
    refreshData();
  }

  async function handleStartSession(id: number) {
    await apiPost(`/live/sessions/${id}/start`, {});
    refreshData();
  }
  async function handleStopSession(id: number) {
    await apiPost(`/live/sessions/${id}/stop`, {});
    refreshData();
  }
  async function handleDeleteSession(id: number) {
    await apiFetch(`/live/sessions/${id}`, { method: "DELETE" });
    refreshData();
  }
  async function handleApproveOrder(id: number) {
    await apiPost(`/live/orders/${id}/approve`, {});
    refreshData();
  }
  async function handleRejectOrder(id: number) {
    await apiPost(`/live/orders/${id}/reject`, {});
    refreshData();
  }
  async function handleCancelOrder(id: number) {
    await apiPost(`/live/orders/${id}/cancel`, {});
    refreshData();
  }
  async function handleSync() {
    await apiPost("/live/sync", {});
    refreshData();
  }

  const inputCls = "w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";

  return (
    <ResizableGroup direction="horizontal" className="h-full">
      {/* Left: Sessions + Config */}
      <Panel defaultSize={22} minSize={16} maxSize={30} className="flex flex-col overflow-hidden border-r border-slate-200 dark:border-slate-800">
        {/* Mode toggle + P&L header */}
        <div className="border-b border-slate-200 p-3 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
              <button
                onClick={() => setMode("manual")}
                className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors",
                  mode === "manual" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100" : "text-slate-400")}
              >
                <Hand size={10} /> Manual
              </button>
              <button
                onClick={() => setMode("auto")}
                className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors",
                  mode === "auto" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100" : "text-slate-400")}
              >
                <Bot size={10} /> Auto
              </button>
            </div>
            <button onClick={handleSync} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Sync Kite orders">
              <RefreshCw size={12} />
            </button>
          </div>

          {/* Day P&L bar */}
          <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
            <div className="text-[10px]">
              <span className="text-slate-400">Day P&L</span>
              <div className={cn("text-sm font-bold font-mono", totalPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                {totalPnl >= 0 ? "+" : ""}₹{totalPnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="flex gap-3 text-[9px]">
              <div>
                <span className="text-slate-400">Realized</span>
                <div className={cn("font-mono font-medium", dayPnl.realized >= 0 ? "text-emerald-400" : "text-red-400")}>
                  ₹{dayPnl.realized.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Unrealized</span>
                <div className={cn("font-mono font-medium", dayPnl.unrealized >= 0 ? "text-emerald-400" : "text-red-400")}>
                  ₹{dayPnl.unrealized.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>
          </div>

          {/* Margins */}
          {portfolio?.margins && (
            <div className="mt-1.5 flex items-center justify-between text-[9px] text-slate-400">
              <span>Available: ₹{(portfolio.margins.equity_available || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              <span>Used: ₹{(portfolio.margins.equity_used || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
            </div>
          )}
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto p-2 [scrollbar-width:thin]">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Trading Sessions
            </div>
            <button onClick={() => setShowCreateSession(true)} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Plus size={12} />
            </button>
          </div>

          {sessions.length === 0 ? (
            <button
              onClick={() => setShowCreateSession(true)}
              className="w-full rounded-md border-2 border-dashed border-slate-300 py-4 text-center text-[10px] text-slate-400 hover:border-indigo-500 hover:text-indigo-500 transition-colors dark:border-slate-700"
            >
              <Plus size={14} className="mx-auto mb-1" />
              Create Trading Session
            </button>
          ) : (
            <div className="space-y-1.5">
              {sessions.map(s => (
                <div key={s.id} className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-medium text-slate-300 truncate">{s.name}</div>
                    <span className={cn("rounded px-1.5 py-0.5 text-[8px] font-bold uppercase",
                      s.status === "running" && "bg-emerald-500/10 text-emerald-400",
                      s.status === "stopped" && "bg-red-500/10 text-red-400",
                      s.status === "idle" && "bg-slate-500/10 text-slate-400",
                      s.status === "paused" && "bg-amber-500/10 text-amber-400",
                    )}>
                      {s.status}
                    </span>
                  </div>
                  <div className="text-[9px] text-slate-400 mb-1">
                    {s.strategy_name} · {s.mode} · {s.symbols.length} symbols
                  </div>
                  <div className="flex items-center gap-1">
                    {s.status !== "running" ? (
                      <button onClick={() => handleStartSession(s.id)}
                        className="flex items-center gap-0.5 rounded bg-emerald-600/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 hover:bg-emerald-600/20">
                        <Play size={8} /> Start
                      </button>
                    ) : (
                      <button onClick={() => handleStopSession(s.id)}
                        className="flex items-center gap-0.5 rounded bg-red-600/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-400 hover:bg-red-600/20">
                        <Square size={8} /> Stop
                      </button>
                    )}
                    <button onClick={() => handleDeleteSession(s.id)}
                      className="rounded p-0.5 text-slate-400 hover:text-red-400">
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pending approvals badge */}
          {pendingApprovals.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-950/20 p-2">
              <div className="text-[10px] font-semibold text-amber-400 mb-1">
                {pendingApprovals.length} Pending Approval{pendingApprovals.length > 1 ? "s" : ""}
              </div>
              {pendingApprovals.slice(0, 5).map(o => (
                <div key={o.id} className="flex items-center justify-between py-0.5">
                  <div className="text-[9px] text-slate-300">
                    <span className={o.side === "BUY" ? "text-emerald-400" : "text-red-400"}>{o.side}</span>
                    {" "}{o.symbol} x{o.quantity}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleApproveOrder(o.id)} className="rounded bg-emerald-600/20 p-0.5 text-emerald-400 hover:bg-emerald-600/30">
                      <Check size={10} />
                    </button>
                    <button onClick={() => handleRejectOrder(o.id)} className="rounded bg-red-600/20 p-0.5 text-red-400 hover:bg-red-600/30">
                      <X size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>
      <ResizeHandle />

      {/* Center: Order Entry + Tables */}
      <Panel defaultSize={52} minSize={35}>
        <ResizableGroup direction="vertical" className="h-full">
          {/* Order Entry */}
          <Panel defaultSize={mode === "manual" ? 35 : 10} minSize={8} maxSize={50}
            className="overflow-auto border-b border-slate-200 dark:border-slate-800">
            {mode === "manual" ? (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Zap size={12} /> Place Order (Zerodha)
                  {!portfolio?.connected && (
                    <span className="ml-2 rounded bg-red-500/10 px-1.5 py-0.5 text-[9px] text-red-400">Kite Disconnected</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setOrderSide("BUY")}
                    className={cn("flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-bold transition-colors",
                      orderSide === "BUY" ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                        : "border border-slate-200 text-slate-400 hover:border-emerald-500 dark:border-slate-700")}>
                    <ArrowUpCircle size={16} /> BUY
                  </button>
                  <button onClick={() => setOrderSide("SELL")}
                    className={cn("flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-bold transition-colors",
                      orderSide === "SELL" ? "bg-red-600 text-white shadow-lg shadow-red-600/20"
                        : "border border-slate-200 text-slate-400 hover:border-red-500 dark:border-slate-700")}>
                    <ArrowDownCircle size={16} /> SELL
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="mb-0.5 block text-[10px] font-medium text-slate-400">Symbol</label>
                    <input type="text" value={orderSymbol} onChange={e => setOrderSymbol(e.target.value.toUpperCase())} placeholder="RELIANCE" className={inputCls} />
                    {orderSymbol && prices[orderSymbol] && (
                      <div className="mt-0.5 text-[9px] font-mono text-slate-400">LTP: ₹{prices[orderSymbol].ltp.toFixed(2)}</div>
                    )}
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] font-medium text-slate-400">Qty</label>
                    <input type="number" value={orderQty} onChange={e => setOrderQty(Math.max(1, Number(e.target.value)))} min={1} className={inputCls} />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] font-medium text-slate-400">Type</label>
                    <select value={orderType} onChange={e => setOrderType(e.target.value)} className={inputCls}>
                      <option value="MARKET">Market</option>
                      <option value="LIMIT">Limit</option>
                      <option value="SL">SL</option>
                      <option value="SL-M">SL-M</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] font-medium text-slate-400">Product</label>
                    <select value={orderProduct} onChange={e => setOrderProduct(e.target.value)} className={inputCls}>
                      <option value="CNC">CNC (Delivery)</option>
                      <option value="MIS">MIS (Intraday)</option>
                      <option value="NRML">NRML</option>
                    </select>
                  </div>
                </div>
                {orderType === "LIMIT" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-0.5 block text-[10px] font-medium text-slate-400">Limit Price</label>
                      <input type="number" value={orderPrice ?? ""} onChange={e => setOrderPrice(Number(e.target.value))} step={0.05} className={inputCls} />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-medium text-slate-400">Stop Loss</label>
                      <input type="number" value={orderStoploss ?? ""} onChange={e => setOrderStoploss(Number(e.target.value))} step={0.05} className={inputCls} />
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="text-[10px] text-slate-400">
                    Est: <span className="font-mono font-medium text-slate-300">
                      ₹{((prices[orderSymbol]?.ltp || 0) * orderQty).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <button onClick={handlePlaceOrder} disabled={orderLoading || !orderSymbol.trim()}
                    className={cn("rounded-md px-6 py-2 text-sm font-bold text-white transition-colors disabled:opacity-50",
                      orderSide === "BUY" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700")}>
                    {orderLoading ? "Placing..." : `${orderSide} ${orderSymbol || "—"}`}
                  </button>
                </div>
                {orderMsg && (
                  <div className={cn("rounded-md px-3 py-1.5 text-xs",
                    orderMsg.type === "success" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                      : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400")}>
                    {orderMsg.text}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-4 p-3 text-xs text-slate-400">
                <Bot size={14} className="text-indigo-400" />
                <span>Auto mode active — strategies generate signals, orders need approval in manual sessions or auto-execute in auto sessions.</span>
              </div>
            )}
          </Panel>
          <ResizeHandle />

          {/* Bottom tabs */}
          <Panel defaultSize={mode === "manual" ? 65 : 90} minSize={30} className="flex flex-col overflow-hidden">
            <div className="flex items-center gap-1 border-b border-slate-200 px-3 py-1.5 dark:border-slate-700">
              {(["positions", "holdings", "orders", "sessions"] as Tab[]).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={cn("rounded px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                    activeTab === tab ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800")}>
                  {tab}
                  {tab === "positions" && livePositions.length > 0 && <span className="ml-1 text-[9px] opacity-70">{livePositions.length}</span>}
                  {tab === "orders" && orders.length > 0 && <span className="ml-1 text-[9px] opacity-70">{orders.length}</span>}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-auto p-2 [scrollbar-width:thin]">
              {/* Positions tab */}
              {activeTab === "positions" && (
                livePositions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">No open positions{!portfolio?.connected && " (Kite disconnected)"}</div>
                ) : (
                  <table className="w-full text-left text-[10px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Symbol</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Qty</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Avg</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">LTP</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">P&L</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Product</th>
                      </tr>
                    </thead>
                    <tbody>
                      {livePositions.map((p, i) => (
                        <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="px-2 py-1.5 font-medium text-slate-300">{p.symbol}</td>
                          <td className="px-2 py-1.5 font-mono text-slate-400">{p.quantity}</td>
                          <td className="px-2 py-1.5 font-mono text-slate-400">₹{p.avg_price.toFixed(2)}</td>
                          <td className="px-2 py-1.5 font-mono text-slate-300">₹{p.ltp.toFixed(2)}</td>
                          <td className={cn("px-2 py-1.5 font-mono font-semibold", p.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {p.pnl >= 0 ? "+" : ""}₹{p.pnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                          </td>
                          <td className="px-2 py-1.5 text-slate-400">{p.product}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {/* Holdings tab */}
              {activeTab === "holdings" && (
                !portfolio?.holdings?.length ? (
                  <div className="py-8 text-center text-xs text-slate-400">No holdings{!portfolio?.connected && " (Kite disconnected)"}</div>
                ) : (
                  <table className="w-full text-left text-[10px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Symbol</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Qty</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Avg</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">LTP</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">P&L</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Day %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.holdings.map((h, i) => (
                        <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="px-2 py-1.5 font-medium text-slate-300">{h.symbol}</td>
                          <td className="px-2 py-1.5 font-mono text-slate-400">{h.quantity}</td>
                          <td className="px-2 py-1.5 font-mono text-slate-400">₹{h.avg_price.toFixed(2)}</td>
                          <td className="px-2 py-1.5 font-mono text-slate-300">₹{h.ltp.toFixed(2)}</td>
                          <td className={cn("px-2 py-1.5 font-mono font-semibold", h.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {h.pnl >= 0 ? "+" : ""}₹{h.pnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                          </td>
                          <td className={cn("px-2 py-1.5 font-mono", h.day_change_pct >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {h.day_change_pct >= 0 ? "+" : ""}{h.day_change_pct.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {/* Orders tab */}
              {activeTab === "orders" && (
                orders.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">No orders yet</div>
                ) : (
                  <table className="w-full text-left text-[10px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Time</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Symbol</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Side</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Qty</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Type</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Filled</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Status</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Signal</th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(o => (
                        <tr key={o.id} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="px-2 py-1 font-mono text-slate-500">{o.created_at?.split("T")[1]?.slice(0, 8) ?? "—"}</td>
                          <td className="px-2 py-1 font-medium text-slate-300">{o.symbol}</td>
                          <td className={cn("px-2 py-1 font-semibold", o.side === "BUY" ? "text-emerald-400" : "text-red-400")}>{o.side}</td>
                          <td className="px-2 py-1 font-mono text-slate-400">{o.quantity}</td>
                          <td className="px-2 py-1 text-slate-400">{o.order_type}</td>
                          <td className="px-2 py-1 font-mono text-slate-300">{o.filled_price ? `₹${o.filled_price.toFixed(2)}` : "—"}</td>
                          <td className="px-2 py-1">
                            <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-semibold",
                              o.status === "COMPLETE" && "bg-emerald-500/10 text-emerald-400",
                              o.status === "PLACED" && "bg-blue-500/10 text-blue-400",
                              o.status === "PENDING" && "bg-amber-500/10 text-amber-400",
                              o.status === "CANCELLED" && "bg-slate-500/10 text-slate-400",
                              o.status === "REJECTED" && "bg-red-500/10 text-red-400",
                            )}>{o.status}</span>
                          </td>
                          <td className="px-2 py-1 text-[9px] text-slate-500 max-w-[120px] truncate">{o.signal_reason}</td>
                          <td className="px-2 py-1">
                            <div className="flex gap-0.5">
                              {o.needs_approval && o.status === "PENDING" && (
                                <>
                                  <button onClick={() => handleApproveOrder(o.id)} className="rounded bg-emerald-600/20 p-0.5 text-emerald-400"><Check size={10} /></button>
                                  <button onClick={() => handleRejectOrder(o.id)} className="rounded bg-red-600/20 p-0.5 text-red-400"><X size={10} /></button>
                                </>
                              )}
                              {o.status === "PLACED" && (
                                <button onClick={() => handleCancelOrder(o.id)} className="rounded p-0.5 text-slate-400 hover:text-red-400"><X size={10} /></button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {/* Sessions tab */}
              {activeTab === "sessions" && (
                sessions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">No trading sessions</div>
                ) : (
                  <table className="w-full text-left text-[10px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Name</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Strategy</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Mode</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Symbols</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Product</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Status</th>
                        <th className="px-2 py-1.5 text-slate-400 font-medium">Trades</th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map(s => (
                        <tr key={s.id} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="px-2 py-1.5 font-medium text-slate-300">{s.name}</td>
                          <td className="px-2 py-1.5 text-slate-400">{s.strategy_name}</td>
                          <td className="px-2 py-1.5">
                            <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-semibold",
                              s.mode === "auto" ? "bg-indigo-500/10 text-indigo-400" : "bg-slate-500/10 text-slate-400")}>{s.mode}</span>
                          </td>
                          <td className="px-2 py-1.5 text-slate-400">{s.symbols.length} stocks</td>
                          <td className="px-2 py-1.5 text-slate-400">{s.product}</td>
                          <td className="px-2 py-1.5">
                            <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold",
                              s.status === "running" && "bg-emerald-500/10 text-emerald-400",
                              s.status === "stopped" && "bg-red-500/10 text-red-400",
                              s.status === "idle" && "bg-slate-500/10 text-slate-400",
                            )}>{s.status}</span>
                          </td>
                          <td className="px-2 py-1.5 font-mono text-slate-400">{s.trades_today}</td>
                          <td className="px-2 py-1.5">
                            <div className="flex gap-1">
                              {s.status !== "running" ? (
                                <button onClick={() => handleStartSession(s.id)} className="rounded bg-emerald-600/10 p-0.5 text-emerald-400 hover:bg-emerald-600/20"><Play size={10} /></button>
                              ) : (
                                <button onClick={() => handleStopSession(s.id)} className="rounded bg-red-600/10 p-0.5 text-red-400 hover:bg-red-600/20"><Square size={10} /></button>
                              )}
                              <button onClick={() => handleDeleteSession(s.id)} className="rounded p-0.5 text-slate-400 hover:text-red-400"><Trash2 size={10} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </Panel>
        </ResizableGroup>
      </Panel>

      <CollapsibleChatPanel title="Live Trade AI" placeholder="e.g. Why was this trade proposed?" tab="live_trade" />

      {/* Create session modal */}
      {showCreateSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="relative w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 max-h-[80vh] overflow-y-auto">
            <button onClick={() => setShowCreateSession(false)} className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X size={16} />
            </button>
            <h3 className="text-lg font-semibold text-slate-100 mb-4">Create Trading Session</h3>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Session Name</label>
                <input type="text" value={csName} onChange={e => setCsName(e.target.value)} className={inputCls} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Strategy *</label>
                  <select value={csStrategyId} onChange={e => setCsStrategyId(Number(e.target.value))} className={inputCls}>
                    <option value="">Select strategy...</option>
                    {(strategies ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Batch (optional)</label>
                  <select value={csBatchId} onChange={e => setCsBatchId(e.target.value ? Number(e.target.value) : "")} className={inputCls}>
                    <option value="">None — enter symbols</option>
                    {(batches ?? []).map(b => <option key={b.id} value={b.id}>{b.name} ({b.symbols.length})</option>)}
                  </select>
                </div>
              </div>

              {/* Symbol selection */}
              {batchSymbols.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-slate-400">Select Symbols ({csSelectedSyms.length}/{batchSymbols.length})</label>
                    <div className="flex gap-1">
                      <button onClick={() => setCsSelectedSyms(batchSymbols)} className="text-[9px] text-indigo-400 hover:underline">All</button>
                      <button onClick={() => setCsSelectedSyms([])} className="text-[9px] text-red-400 hover:underline">None</button>
                    </div>
                  </div>
                  <div className="max-h-32 overflow-y-auto rounded-md border border-slate-200 p-2 dark:border-slate-700 flex flex-wrap gap-1">
                    {batchSymbols.map(sym => (
                      <button key={sym} onClick={() => {
                        setCsSelectedSyms(prev =>
                          prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
                        );
                      }}
                        className={cn("rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors",
                          csSelectedSyms.includes(sym) ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800")}>
                        {sym}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!csBatchId && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Symbols (comma-separated)</label>
                  <input type="text" value={csSelectedSyms.join(",")}
                    onChange={e => setCsSelectedSyms(e.target.value.split(",").map(s => s.trim().toUpperCase()).filter(Boolean))}
                    placeholder="RELIANCE, TCS, INFY" className={inputCls} />
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Mode</label>
                  <select value={csMode} onChange={e => setCsMode(e.target.value as "manual" | "auto")} className={inputCls}>
                    <option value="manual">Manual (approve)</option>
                    <option value="auto">Auto (execute)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Product</label>
                  <select value={csProduct} onChange={e => setCsProduct(e.target.value)} className={inputCls}>
                    <option value="CNC">CNC</option>
                    <option value="MIS">MIS</option>
                    <option value="NRML">NRML</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Qty / Trade</label>
                  <input type="number" value={csQty} onChange={e => setCsQty(Number(e.target.value))} min={1} className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">SL %</label>
                  <input type="number" value={csSL} onChange={e => setCsSL(Number(e.target.value))} step={0.5} className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Target %</label>
                  <input type="number" value={csTarget} onChange={e => setCsTarget(Number(e.target.value))} step={0.5} className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Daily Limit ₹</label>
                  <input type="number" value={csDailyLimit} onChange={e => setCsDailyLimit(Number(e.target.value))} step={1000} className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Scan (sec)</label>
                  <input type="number" value={csInterval} onChange={e => setCsInterval(Number(e.target.value))} min={10} className={inputCls} />
                </div>
              </div>

              {csMode === "auto" && (
                <div className="rounded-md border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-[10px] text-amber-400">
                  <AlertOctagon size={12} className="inline mr-1" />
                  Auto mode will place <strong>real orders</strong> on Zerodha without confirmation. Use with caution.
                </div>
              )}

              <button onClick={handleCreateSession} disabled={!csStrategyId}
                className="w-full rounded-md bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50">
                Create Session
              </button>
            </div>
          </div>
        </div>
      )}
    </ResizableGroup>
  );
}
