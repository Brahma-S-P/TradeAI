import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Activity, Pause, Play, Trash2 } from "lucide-react";

interface TickRow {
  id: number;
  time: string;
  ltp: number;
  change: number;
  changePct: number;
  volume: number;
  buyQty: number;
  sellQty: number;
  lastQty: number;
  avgPrice: number;
}

interface QuoteResponse {
  quotes: Array<{
    ltp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    change_pct: number;
    buy_quantity?: number;
    sell_quantity?: number;
    last_quantity?: number;
    average_price?: number;
    depth?: {
      buy?: Array<{ price: number; quantity: number; orders: number }>;
      sell?: Array<{ price: number; quantity: number; orders: number }>;
    };
  }>;
  source: "kite" | "mock";
}

interface MarketDepthLevel {
  price: number;
  quantity: number;
  orders: number;
}

export function LiveTickerTable({ symbol }: { symbol: string }) {
  const [ticks, setTicks] = useState<TickRow[]>([]);
  const [paused, setPaused] = useState(false);
  const [depth, setDepth] = useState<{ buy: MarketDepthLevel[]; sell: MarketDepthLevel[] }>({ buy: [], sell: [] });
  const [isLive, setIsLive] = useState(false);
  const seqRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLtpRef = useRef<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await apiFetch<QuoteResponse>(`/stocks/quotes?symbols=${symbol}`);
      if (res.source !== "kite" || res.quotes.length === 0) {
        setIsLive(false);
        return;
      }
      setIsLive(true);
      const q = res.quotes[0];

      if (q.ltp === prevLtpRef.current) return;
      prevLtpRef.current = q.ltp;

      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-IN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

      const row: TickRow = {
        id: ++seqRef.current,
        time: timeStr,
        ltp: q.ltp,
        change: q.ltp - q.close,
        changePct: q.change_pct,
        volume: q.volume,
        buyQty: q.buy_quantity ?? 0,
        sellQty: q.sell_quantity ?? 0,
        lastQty: q.last_quantity ?? 0,
        avgPrice: q.average_price ?? 0,
      };

      setTicks((prev) => {
        const next = [...prev, row];
        if (next.length > 200) next.splice(0, next.length - 200);
        return next;
      });

      if (q.depth) {
        setDepth({
          buy: (q.depth.buy ?? []).slice(0, 5),
          sell: (q.depth.sell ?? []).slice(0, 5),
        });
      }
    } catch { /* ignore */ }
  }, [symbol]);

  useEffect(() => {
    setTicks([]);
    seqRef.current = 0;
    prevLtpRef.current = null;
    setDepth({ buy: [], sell: [] });
    setIsLive(false);

    if (paused) return;
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [symbol, paused, poll]);

  useEffect(() => {
    if (scrollRef.current && !paused) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [ticks, paused]);

  const totalBuy = depth.buy.reduce((s, l) => s + l.quantity, 0);
  const totalSell = depth.sell.reduce((s, l) => s + l.quantity, 0);
  const depthAvailable = depth.buy.length > 0 || depth.sell.length > 0;

  if (!isLive) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-400">
        <Activity size={14} />
        Live ticker available when connected to Kite
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col text-[10px]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-2 py-1 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <Activity size={10} className="text-emerald-500" />
          <span className="font-medium text-slate-500 dark:text-slate-400">
            Live Ticker
          </span>
          <span className="rounded bg-emerald-100 px-1 py-px text-[8px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            {ticks.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPaused((p) => !p)}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            title={paused ? "Resume" : "Pause"}
          >
            {paused ? <Play size={10} /> : <Pause size={10} />}
          </button>
          <button
            onClick={() => { setTicks([]); seqRef.current = 0; }}
            className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
            title="Clear"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Tick table */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="grid shrink-0 grid-cols-[60px_1fr_1fr_1fr_1fr_1fr] gap-px border-b border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
            <span>Time</span>
            <span className="text-right">LTP</span>
            <span className="text-right">Chg</span>
            <span className="text-right">Vol</span>
            <span className="text-right">Buy Q</span>
            <span className="text-right">Sell Q</span>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto [scrollbar-width:thin]">
            {ticks.length === 0 ? (
              <div className="py-4 text-center text-slate-400">Waiting for ticks...</div>
            ) : (
              ticks.map((t) => (
                <div
                  key={t.id}
                  className="grid grid-cols-[60px_1fr_1fr_1fr_1fr_1fr] gap-px border-b border-slate-100 px-2 py-px tabular-nums dark:border-slate-900"
                >
                  <span className="text-slate-400">{t.time}</span>
                  <span className={cn("text-right font-medium", t.change >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                    {t.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                  <span className={cn("text-right", t.change >= 0 ? "text-emerald-500" : "text-red-500")}>
                    {t.change >= 0 ? "+" : ""}{t.change.toFixed(2)}
                  </span>
                  <span className="text-right text-slate-500 dark:text-slate-400">
                    {t.volume >= 1e7 ? (t.volume / 1e7).toFixed(1) + "Cr" : t.volume >= 1e5 ? (t.volume / 1e5).toFixed(1) + "L" : t.volume.toLocaleString("en-IN")}
                  </span>
                  <span className="text-right text-emerald-600 dark:text-emerald-400">
                    {t.buyQty.toLocaleString("en-IN")}
                  </span>
                  <span className="text-right text-red-600 dark:text-red-400">
                    {t.sellQty.toLocaleString("en-IN")}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Market depth */}
        {depthAvailable && (
          <div className="w-[180px] shrink-0 border-l border-slate-200 dark:border-slate-800">
            <div className="border-b border-slate-200 px-2 py-0.5 text-center font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Market Depth
            </div>
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-px border-b border-slate-200 bg-slate-50 px-1.5 py-px font-medium text-slate-400 dark:border-slate-800 dark:bg-slate-900/50">
              <span>Bid</span>
              <span className="text-center">Qty</span>
              <span className="text-right">Orders</span>
            </div>
            {depth.buy.map((l, i) => (
              <div key={`b${i}`} className="grid grid-cols-[1fr_1fr_1fr] gap-px border-b border-slate-100 px-1.5 py-px text-emerald-600 dark:border-slate-900 dark:text-emerald-400">
                <span>{l.price.toFixed(2)}</span>
                <span className="text-center">{l.quantity.toLocaleString("en-IN")}</span>
                <span className="text-right">{l.orders}</span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-px border-b border-slate-200 bg-slate-50 px-1.5 py-px font-medium text-slate-400 dark:border-slate-800 dark:bg-slate-900/50">
              <span>Ask</span>
              <span className="text-center">Qty</span>
              <span className="text-right">Orders</span>
            </div>
            {depth.sell.map((l, i) => (
              <div key={`s${i}`} className="grid grid-cols-[1fr_1fr_1fr] gap-px border-b border-slate-100 px-1.5 py-px text-red-600 dark:border-slate-900 dark:text-red-400">
                <span>{l.price.toFixed(2)}</span>
                <span className="text-center">{l.quantity.toLocaleString("en-IN")}</span>
                <span className="text-right">{l.orders}</span>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-px border-t border-slate-200 px-1.5 py-0.5 font-medium dark:border-slate-800">
              <span className="text-emerald-600 dark:text-emerald-400">
                {totalBuy.toLocaleString("en-IN")}
              </span>
              <span className="text-right text-red-600 dark:text-red-400">
                {totalSell.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
