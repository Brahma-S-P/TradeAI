import { useState, useEffect } from "react";
import { ResizableGroup, Panel, ResizeHandle } from "@/components/panels/ResizablePanel";
import { CollapsibleChatPanel } from "@/components/panels/CollapsibleChatPanel";
import { SectionLabel } from "@/components/panels/SectionLabel";
import { EmptyState } from "@/components/panels/EmptyState";
import { StrategySelector } from "@/components/panels/StrategySelector";
import { RiskProfileSelector } from "@/components/panels/RiskProfileSelector";
import { RunControls } from "@/components/panels/RunControls";
import { PromoteToLiveButton } from "@/components/panels/PromoteToLiveButton";
import { useApi } from "@/lib/useApi";
import { useWebSocket } from "@/lib/useWebSocket";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";

interface Strategy { id: string; name: string; version: number; }
interface RiskProfile { id: string; name: string; version: number; }

interface Position {
  symbol: string; side: string; quantity: number;
  entry_price: number; ltp: number; pnl: number; entry_time: string;
}

interface ClosedTrade {
  symbol: string; side: string; quantity: number;
  entry_price: number; exit_price: number; pnl: number;
  entry_time: string; exit_time: string; exit_reason: string;
}

interface SignalLogItem {
  id: string; timestamp: string; symbol: string; signal_type: string;
  reason: string; price: number; executed: boolean; pnl: number | null;
}

interface SessionDetail {
  id: string; strategy_name: string; risk_profile_name: string;
  status: string; started_at: string;
  virtual_capital: number; current_value: number;
  total_pnl: number; total_pnl_pct: number;
  open_positions: Position[];
  closed_trades: ClosedTrade[];
  signal_log: SignalLogItem[];
  equity_curve: { time: string; value: number }[];
  stats: {
    total_trades: number; open_trades: number; win_rate: number;
    max_drawdown: number; sharpe_ratio: number; avg_trade_duration: string;
  };
}

interface SessionSummary {
  id: string; strategy_name: string; risk_profile_name: string;
  status: string; started_at: string;
  virtual_capital: number; current_value: number;
  total_pnl: number; total_pnl_pct: number;
  total_trades: number; win_rate: number;
}

interface PriceTick {
  type: string;
  data: { symbol: string; ltp: number }[];
}

export function LiveStrategyTest() {
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "completed">("idle");
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionDetail | null>(null);

  const { data: strategies } = useApi<Strategy[]>("/strategies");
  const { data: profiles } = useApi<RiskProfile[]>("/strategies/risk-profiles/list");
  const { data: sessions } = useApi<SessionSummary[]>("/paper-trading/sessions");
  const { lastMessage } = useWebSocket<PriceTick>(
    `ws://${window.location.hostname}:8000/ws/prices`
  );

  async function handleStart() {
    setRunStatus("running");
    const data = await apiFetch<SessionDetail>("/paper-trading/sessions/1");
    setSession(data);
  }

  function handleStop() {
    setRunStatus("completed");
  }

  const livePositions = (session?.open_positions ?? []).map((p) => {
    const tick = lastMessage?.data?.find((t) => t.symbol === p.symbol);
    if (!tick) return p;
    const ltp = tick.ltp;
    return { ...p, ltp, pnl: parseFloat(((ltp - p.entry_price) * p.quantity).toFixed(2)) };
  });

  useEffect(() => {
    if (runStatus === "running" && session) {
      const interval = setInterval(async () => {
        const data = await apiFetch<SessionDetail>("/paper-trading/sessions/1");
        setSession(data);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [runStatus, session]);

  return (
    <ResizableGroup direction="horizontal" className="h-full">
      {/* Sessions sidebar */}
      <Panel defaultSize={15} minSize={10} maxSize={25} className="overflow-auto border-r border-slate-200 p-3 dark:border-slate-800">
        <SectionLabel>Test Sessions</SectionLabel>
        {!sessions || sessions.length === 0 ? (
          <EmptyState text="No sessions yet." />
        ) : (
          <ul className="space-y-1.5">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  onClick={async () => {
                    const data = await apiFetch<SessionDetail>(`/paper-trading/sessions/${s.id}`);
                    setSession(data);
                    setRunStatus(s.status === "running" ? "running" : "completed");
                  }}
                  className={cn(
                    "w-full rounded-md border px-2.5 py-2 text-left text-sm transition-colors",
                    session?.id === s.id
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950"
                      : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{s.strategy_name}</span>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold",
                      s.status === "running" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                    )}>{s.status.toUpperCase()}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{s.risk_profile_name}</div>
                  <div className={cn("mt-0.5 text-xs font-medium", s.total_pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                    {s.total_pnl >= 0 ? "+" : ""}₹{Math.abs(s.total_pnl).toFixed(2)} ({s.total_pnl_pct}%)
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <ResizeHandle />

      {/* Main content */}
      <Panel defaultSize={55} minSize={30}>
        <ResizableGroup direction="vertical" className="h-full">
          {/* Controls + Summary */}
          <Panel defaultSize={18} minSize={12} className="overflow-auto p-3">
            <SectionLabel>Strategy Test Configuration</SectionLabel>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <StrategySelector strategies={strategies ?? []} selectedId={selectedStrategyId} onSelect={setSelectedStrategyId} />
                <RiskProfileSelector profiles={profiles ?? []} selectedId={selectedProfileId} onSelect={setSelectedProfileId} />
              </div>
              <div className="flex items-center gap-3">
                <RunControls
                  status={runStatus === "running" ? "running" : runStatus === "completed" ? "completed" : "idle"}
                  onRun={handleStart}
                  onStop={handleStop}
                  onRerun={handleStart}
                />
                <PromoteToLiveButton disabled={runStatus !== "completed" || !session || (session.stats.win_rate < 50)} />
              </div>
              {session && (
                <div className="flex flex-wrap gap-4 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                  <StatChip label="Virtual Capital" value={`₹${session.virtual_capital.toLocaleString()}`} />
                  <StatChip label="Current Value" value={`₹${session.current_value.toLocaleString()}`} />
                  <StatChip label="P&L" value={`${session.total_pnl >= 0 ? "+" : ""}₹${Math.abs(session.total_pnl).toFixed(2)}`} color={session.total_pnl >= 0 ? "green" : "red"} />
                  <StatChip label="Win Rate" value={`${session.stats.win_rate}%`} />
                  <StatChip label="Trades" value={`${session.stats.total_trades} closed / ${session.stats.open_trades} open`} />
                  <StatChip label="Max DD" value={`${session.stats.max_drawdown}%`} />
                  <StatChip label="Sharpe" value={session.stats.sharpe_ratio.toString()} />
                  <StatChip label="Avg Duration" value={session.stats.avg_trade_duration} />
                </div>
              )}
            </div>
          </Panel>
          <ResizeHandle />

          {/* Equity Curve */}
          <Panel defaultSize={17} minSize={10} className="overflow-auto p-3">
            <SectionLabel>Live Equity Curve</SectionLabel>
            {!session ? (
              <EmptyState text="Start a test session to see the equity curve." />
            ) : (
              <div className="flex h-24 items-end gap-px rounded-md border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                {session.equity_curve.map((point, i) => {
                  const min = Math.min(...session.equity_curve.map((p) => p.value));
                  const max = Math.max(...session.equity_curve.map((p) => p.value));
                  const range = max - min || 1;
                  const height = ((point.value - min) / range) * 100;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex-1 rounded-t-sm transition-all",
                        point.value >= session.virtual_capital ? "bg-emerald-500" : "bg-red-500"
                      )}
                      style={{ height: `${Math.max(height, 3)}%` }}
                      title={`${point.time}: ₹${point.value.toLocaleString()}`}
                    />
                  );
                })}
              </div>
            )}
          </Panel>
          <ResizeHandle />

          {/* Open Positions */}
          <Panel defaultSize={20} minSize={10} className="overflow-auto p-3">
            <SectionLabel>Open Virtual Positions ({livePositions.length})</SectionLabel>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-3 py-2">Symbol</th>
                    <th className="px-3 py-2">Side</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Entry</th>
                    <th className="px-3 py-2 text-right">LTP</th>
                    <th className="px-3 py-2 text-right">P&amp;L</th>
                    <th className="px-3 py-2">Entry Time</th>
                  </tr>
                </thead>
                <tbody>
                  {livePositions.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No open positions.</td></tr>
                  ) : (
                    livePositions.map((p, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900">
                        <td className="px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200">{p.symbol}</td>
                        <td className="px-3 py-1.5">
                          <span className={cn("rounded px-2 py-0.5 text-xs font-bold", p.side === "BUY" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400")}>{p.side}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">{p.quantity}</td>
                        <td className="px-3 py-1.5 text-right font-mono">₹{p.entry_price.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right font-mono">₹{p.ltp.toFixed(2)}</td>
                        <td className={cn("px-3 py-1.5 text-right font-mono font-medium", p.pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                          {p.pnl >= 0 ? "+" : ""}₹{Math.abs(p.pnl).toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-slate-400">{p.entry_time}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
          <ResizeHandle />

          {/* Closed Trades */}
          <Panel defaultSize={20} minSize={10} className="overflow-auto p-3">
            <SectionLabel>Closed Trades</SectionLabel>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-3 py-2">Symbol</th>
                    <th className="px-3 py-2">Side</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Entry</th>
                    <th className="px-3 py-2 text-right">Exit</th>
                    <th className="px-3 py-2 text-right">P&amp;L</th>
                    <th className="px-3 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {!session || session.closed_trades.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No closed trades yet.</td></tr>
                  ) : (
                    session.closed_trades.map((t, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900">
                        <td className="px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200">{t.symbol}</td>
                        <td className="px-3 py-1.5">
                          <span className={cn("rounded px-2 py-0.5 text-xs font-bold", t.side === "BUY" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400")}>{t.side}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">{t.quantity}</td>
                        <td className="px-3 py-1.5 text-right font-mono">₹{t.entry_price.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right font-mono">₹{t.exit_price.toFixed(2)}</td>
                        <td className={cn("px-3 py-1.5 text-right font-mono font-medium", t.pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                          {t.pnl >= 0 ? "+" : ""}₹{Math.abs(t.pnl).toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-slate-500">{t.exit_reason}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
          <ResizeHandle />

          {/* Signal Log */}
          <Panel defaultSize={25} minSize={10} className="overflow-auto p-3">
            <SectionLabel>Signal Log</SectionLabel>
            {!session || session.signal_log.length === 0 ? (
              <EmptyState text="No signals fired yet." />
            ) : (
              <div className="space-y-1.5">
                {session.signal_log.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "rounded px-2 py-0.5 text-xs font-bold",
                        s.signal_type === "BUY" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                      )}>{s.signal_type}</span>
                      <span className="font-medium text-slate-700 dark:text-slate-200">{s.symbol}</span>
                      <span className="text-xs text-slate-400">₹{s.price.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">{s.reason}</span>
                      <span className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                        s.executed ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400" : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                      )}>{s.executed ? "EXECUTED" : "SKIPPED"}</span>
                      {s.pnl !== null && (
                        <span className={cn("text-xs font-medium", s.pnl >= 0 ? "text-emerald-600" : "text-red-600")}>
                          {s.pnl >= 0 ? "+" : ""}₹{Math.abs(s.pnl).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </ResizableGroup>
      </Panel>

      <CollapsibleChatPanel
        title="Strategy Test AI"
        placeholder="e.g. How is the strategy performing today?"
        tab="strategy_test"
      />
    </ResizableGroup>
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color?: "green" | "red" }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
      <span className={cn(
        "text-sm font-medium",
        color === "green" && "text-emerald-600 dark:text-emerald-400",
        color === "red" && "text-red-600 dark:text-red-400",
        !color && "text-slate-700 dark:text-slate-200"
      )}>{value}</span>
    </div>
  );
}
