import { useEffect, useRef, useState, useMemo } from "react";
import {
  createChart,
  createSeriesMarkers,
  ColorType,
  CandlestickSeries,
  LineSeries,
} from "lightweight-charts";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";

interface Trade {
  symbol: string;
  direction: string;
  entry_date: string;
  entry_price: number;
  exit_date: string;
  exit_price: number;
  pnl: number;
  pnl_pct: number;
  exit_reason: string;
  quantity: number;
}

interface TradeSignalChartProps {
  trades: Trade[];
  symbols: string[];
  height?: number;
}

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function TradeSignalChart({ trades, symbols, height = 350 }: TradeSignalChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);

  const tradeSymbols = useMemo(() => {
    const syms = new Set(trades.map((t) => t.symbol));
    return Array.from(syms).sort();
  }, [trades]);

  const availableSymbols = tradeSymbols.length > 0 ? tradeSymbols : symbols;

  useEffect(() => {
    if (availableSymbols.length > 0 && !selectedSymbol) {
      setSelectedSymbol(availableSymbols[0]);
    }
  }, [availableSymbols, selectedSymbol]);

  useEffect(() => {
    if (!selectedSymbol) return;
    let cancelled = false;
    setLoading(true);
    apiFetch<{ candles: Candle[] }>(`/stocks/${selectedSymbol}/ohlcv?days=365`)
      .then((data) => {
        if (!cancelled) setCandles(data.candles);
      })
      .catch(() => {
        if (!cancelled) setCandles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedSymbol]);

  const symbolTrades = useMemo(
    () => trades.filter((t) => t.symbol === selectedSymbol),
    [trades, selectedSymbol]
  );

  const tradeSummary = useMemo(() => {
    if (symbolTrades.length === 0) return null;
    const wins = symbolTrades.filter((t) => t.pnl >= 0).length;
    const totalPnl = symbolTrades.reduce((s, t) => s + t.pnl, 0);
    return { count: symbolTrades.length, wins, losses: symbolTrades.length - wins, totalPnl };
  }, [symbolTrades]);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;
    const isDark = document.documentElement.classList.contains("dark");

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#94a3b8" : "#64748b",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? "#1e293b" : "#e2e8f0" },
        horzLines: { color: isDark ? "#1e293b" : "#e2e8f0" },
      },
      rightPriceScale: { borderColor: isDark ? "#334155" : "#cbd5e1" },
      timeScale: { borderColor: isDark ? "#334155" : "#cbd5e1" },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    candleSeries.setData(
      candles.map((c) => ({
        time: c.date.slice(0, 10) as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    const markers: Array<{
      time: any;
      position: "belowBar" | "aboveBar";
      color: string;
      shape: "arrowUp" | "arrowDown";
      text: string;
    }> = [];

    for (const t of symbolTrades) {
      markers.push({
        time: t.entry_date.slice(0, 10) as any,
        position: "belowBar",
        color: "#22c55e",
        shape: "arrowUp",
        text: `BUY ${t.entry_price.toFixed(0)}`,
      });
      markers.push({
        time: t.exit_date.slice(0, 10) as any,
        position: "aboveBar",
        color: "#ef4444",
        shape: "arrowDown",
        text: `SELL ${t.exit_price.toFixed(0)}`,
      });
    }

    markers.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    if (markers.length > 0) {
      createSeriesMarkers(candleSeries, markers);
    }

    // Draw entry-to-exit lines for each trade
    for (let i = 0; i < symbolTrades.length; i++) {
      const t = symbolTrades[i];
      const lineSeries = chart.addSeries(LineSeries, {
        color: t.pnl >= 0 ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      lineSeries.setData([
        { time: t.entry_date.slice(0, 10) as any, value: t.entry_price },
        { time: t.exit_date.slice(0, 10) as any, value: t.exit_price },
      ]);
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, symbolTrades, height]);

  if (availableSymbols.length === 0) {
    return <div className="py-4 text-center text-xs text-slate-400">No symbols to display</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-slate-400">Symbol:</span>
          <div className="flex flex-wrap gap-1">
            {availableSymbols.map((sym) => {
              const symTrades = trades.filter((t) => t.symbol === sym);
              const symPnl = symTrades.reduce((s, t) => s + t.pnl, 0);
              return (
                <button
                  key={sym}
                  onClick={() => setSelectedSymbol(sym)}
                  className={cn(
                    "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
                    selectedSymbol === sym
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                  )}
                >
                  {sym}
                  {symTrades.length > 0 && (
                    <span className={cn("ml-1", symPnl >= 0 ? "text-emerald-300" : "text-red-300")}>
                      ({symTrades.length})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {tradeSummary && (
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-slate-400">{tradeSummary.count} trades</span>
            <span className="text-emerald-400">{tradeSummary.wins}W</span>
            <span className="text-red-400">{tradeSummary.losses}L</span>
            <span className={cn("font-mono font-semibold", tradeSummary.totalPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
              {tradeSummary.totalPnl >= 0 ? "+" : ""}₹{tradeSummary.totalPnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="text-center">
            <div className="mb-1 h-4 w-4 mx-auto animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <span className="text-[10px] text-slate-400">Loading chart...</span>
          </div>
        </div>
      ) : candles.length === 0 ? (
        <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>
          No candle data available for {selectedSymbol}
        </div>
      ) : (
        <div ref={containerRef} />
      )}

      {/* Trade list for selected symbol */}
      {symbolTrades.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[10px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="px-1.5 py-1 text-slate-400 font-medium">Entry</th>
                <th className="px-1.5 py-1 text-slate-400 font-medium">Exit</th>
                <th className="px-1.5 py-1 text-slate-400 font-medium">Entry ₹</th>
                <th className="px-1.5 py-1 text-slate-400 font-medium">Exit ₹</th>
                <th className="px-1.5 py-1 text-slate-400 font-medium">Qty</th>
                <th className="px-1.5 py-1 text-slate-400 font-medium">P&L</th>
                <th className="px-1.5 py-1 text-slate-400 font-medium">%</th>
                <th className="px-1.5 py-1 text-slate-400 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {symbolTrades.map((t, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-1.5 py-0.5 font-mono text-slate-400">{t.entry_date.slice(0, 10)}</td>
                  <td className="px-1.5 py-0.5 font-mono text-slate-400">{t.exit_date.slice(0, 10)}</td>
                  <td className="px-1.5 py-0.5 font-mono">{t.entry_price.toFixed(2)}</td>
                  <td className="px-1.5 py-0.5 font-mono">{t.exit_price.toFixed(2)}</td>
                  <td className="px-1.5 py-0.5 font-mono text-slate-400">{t.quantity}</td>
                  <td className={cn("px-1.5 py-0.5 font-mono font-semibold", t.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(0)}
                  </td>
                  <td className={cn("px-1.5 py-0.5 font-mono", t.pnl_pct >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {t.pnl_pct >= 0 ? "+" : ""}{t.pnl_pct.toFixed(1)}%
                  </td>
                  <td className="px-1.5 py-0.5 text-slate-500">{t.exit_reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
