import { useState } from "react";
import { ResizableGroup, Panel, ResizeHandle } from "@/components/panels/ResizablePanel";
import { CollapsibleChatPanel } from "@/components/panels/CollapsibleChatPanel";
import { SectionLabel } from "@/components/panels/SectionLabel";
import { ModeToggle } from "@/components/panels/ModeToggle";
import { StrategySelector } from "@/components/panels/StrategySelector";
import { ManualSearchBar } from "@/components/panels/ManualSearchBar";
import { useApi } from "@/lib/useApi";
import { useWebSocket } from "@/lib/useWebSocket";
import { cn } from "@/lib/cn";

interface WatchlistItem {
  symbol: string;
  name: string;
  ltp: number;
  change_pct: number;
  volume: number;
  signal: string;
  status: string;
}

interface Signal {
  id: string;
  symbol: string;
  signal_type: string;
  reason: string;
  price: number;
  strategy_name: string;
  timestamp: string;
}

interface Strategy { id: string; name: string; version: number; }

interface PriceTick {
  type: string;
  data: { symbol: string; ltp: number; change_pct: number; volume: number }[];
}

export function LiveStockPick() {
  const [mode, setMode] = useState("Manual");
  const [searchValue, setSearchValue] = useState("");

  const { data: watchlist } = useApi<WatchlistItem[]>("/trading/watchlist");
  const { data: signals } = useApi<Signal[]>("/trading/signals");
  const { data: strategies } = useApi<Strategy[]>("/strategies");
  const { lastMessage, connected } = useWebSocket<PriceTick>(
    `ws://${window.location.hostname}:8000/ws/prices`
  );

  const liveWatchlist = (watchlist ?? []).map((w) => {
    const tick = lastMessage?.data?.find((t) => t.symbol === w.symbol);
    return tick ? { ...w, ltp: tick.ltp, change_pct: tick.change_pct, volume: tick.volume } : w;
  });

  return (
    <ResizableGroup direction="horizontal" className="h-full">
      <Panel defaultSize={70} minSize={40}>
        <ResizableGroup direction="vertical" className="h-full">
          <Panel defaultSize={70} minSize={30} className="overflow-auto p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <SectionLabel>Live Watchlist</SectionLabel>
                {connected && <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" title="WebSocket connected" />}
              </div>
              <div className="flex items-center gap-3">
                <ModeToggle modes={["Manual", "Strategy"]} activeMode={mode} onModeChange={setMode} />
                {mode === "Strategy" && (
                  <StrategySelector strategies={strategies ?? []} selectedId={null} onSelect={() => {}} label="Active Strategy" />
                )}
              </div>
            </div>

            {mode === "Manual" && (
              <div className="mb-3">
                <ManualSearchBar value={searchValue} onChange={setSearchValue} onAdd={() => setSearchValue("")} />
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-3 py-2">Symbol</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2 text-right">LTP</th>
                    <th className="px-3 py-2 text-right">Change %</th>
                    <th className="px-3 py-2 text-right">Volume</th>
                    <th className="px-3 py-2">Signal</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {liveWatchlist.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No instruments tracked yet.</td></tr>
                  ) : (
                    liveWatchlist.map((w) => (
                      <tr key={w.symbol} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900">
                        <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{w.symbol}</td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{w.name}</td>
                        <td className="px-3 py-2 text-right font-mono">₹{w.ltp.toFixed(2)}</td>
                        <td className={cn("px-3 py-2 text-right font-mono font-medium", w.change_pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                          {w.change_pct >= 0 ? "+" : ""}{w.change_pct.toFixed(2)}%
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-500">{(w.volume / 1_000_000).toFixed(1)}M</td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            "inline-block rounded px-2 py-0.5 text-xs font-semibold",
                            w.signal === "BUY" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
                            w.signal === "SELL" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
                            w.signal === "HOLD" && "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
                            w.signal === "—" && "text-slate-400",
                          )}>{w.signal}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{w.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
          <ResizeHandle />

          <Panel defaultSize={30} minSize={15} className="overflow-auto p-3">
            <SectionLabel>Signal Feed</SectionLabel>
            {!signals || signals.length === 0 ? (
              <div className="py-4 text-center text-sm text-slate-400">No signals yet.</div>
            ) : (
              <div className="space-y-2">
                {signals.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "rounded px-2 py-0.5 text-xs font-bold",
                        s.signal_type === "BUY" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                      )}>{s.signal_type}</span>
                      <span className="font-medium text-sm text-slate-700 dark:text-slate-200">{s.symbol}</span>
                      <span className="text-xs text-slate-400">₹{s.price.toFixed(2)}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500">{s.reason}</div>
                      <div className="text-[10px] text-slate-400">{s.strategy_name} · {new Date(s.timestamp).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </ResizableGroup>
      </Panel>

      <CollapsibleChatPanel
        title="Live Pick AI"
        placeholder="e.g. Which promoted strategy is active right now?"
        tab="live_pick"
      />
    </ResizableGroup>
  );
}
