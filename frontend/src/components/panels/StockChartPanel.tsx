import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  ColorType,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  BarSeries,
} from "lightweight-charts";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { X } from "lucide-react";
import {
  sma, ema, bollingerBands, vwap, rsi, macd,
  supertrend, atr, stochastic, obv,
} from "@/lib/chart-indicators";

interface OHLCVData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface QuoteData {
  symbol: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change_pct: number;
}

type ChartType = "candle" | "line" | "area" | "bar";
type TimeRange = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y";
type KiteInterval = "minute" | "5minute" | "15minute" | "60minute" | "day";

const TIME_RANGE_DAYS: Record<TimeRange, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
};

const DEFAULT_INTERVAL: Record<TimeRange, KiteInterval> = {
  "1D": "minute",
  "1W": "15minute",
  "1M": "day",
  "3M": "day",
  "6M": "day",
  "1Y": "day",
};

const INTERVAL_LABELS: Record<KiteInterval, string> = {
  minute: "1m",
  "5minute": "5m",
  "15minute": "15m",
  "60minute": "1H",
  day: "D",
};

const AVAILABLE_INTERVALS: Record<TimeRange, KiteInterval[]> = {
  "1D": ["minute", "5minute", "15minute"],
  "1W": ["5minute", "15minute", "60minute"],
  "1M": ["15minute", "60minute", "day"],
  "3M": ["15minute", "60minute", "day"],
  "6M": ["15minute", "60minute", "day"],
  "1Y": ["15minute", "60minute", "day"],
};

// As you zoom in (smaller visible time span), switch to a finer candle interval.
// Span is measured in days and is interval-independent, so switching does not bounce.
const SPAN_THRESHOLDS: { interval: KiteInterval; maxSpanDays: number }[] = [
  { interval: "15minute", maxSpanDays: 4 },
  { interval: "60minute", maxSpanDays: 25 },
];

// Interval ordering from coarsest to finest; auto-zoom only ever switches to a
// FINER interval than the range's default (so intraday ranges never coarsen).
const INTERVAL_FINENESS: KiteInterval[] = ["day", "60minute", "15minute", "5minute", "minute"];
function isFiner(a: KiteInterval, b: KiteInterval): boolean {
  return INTERVAL_FINENESS.indexOf(a) > INTERVAL_FINENESS.indexOf(b);
}

// lightweight-charts Time -> epoch seconds (handles numbers, 'yyyy-mm-dd', BusinessDay)
function timeToSec(t: unknown): number {
  if (typeof t === "number") return t;
  if (typeof t === "string") {
    const [y, m, d] = t.split("-").map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1) / 1000;
  }
  const bd = t as { year: number; month: number; day: number };
  return Date.UTC(bd.year, bd.month - 1, bd.day) / 1000;
}

export interface SignalResult {
  date: string;
  signal: "BUY" | "SELL";
  price: number;
  label?: string;
}

interface StockChartPanelProps {
  symbol: string;
  name?: string;
  onClose?: () => void;
  indicators?: Set<string>;
  signals?: SignalResult[];
}

export function StockChartPanel({ symbol, name, onClose, indicators, signals }: StockChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<any> | null>(null);
  // Visible range (in epoch seconds) to restore after an auto interval switch,
  // so zooming keeps its position instead of snapping to fit-all.
  const pendingRangeRef = useRef<{ from: number; to: number } | null>(null);
  // Timestamp of the last programmatic range change (fitContent / restore), so the
  // zoom listener can ignore the events those trigger and only react to real zooms.
  const lastProgrammaticRef = useRef(0);
  const [ohlcv, setOhlcv] = useState<OHLCVData[]>([]);
  const [chartType, setChartType] = useState<ChartType>("candle");
  const [timeRange, setTimeRange] = useState<TimeRange>("3M");
  const [interval, setInterval_] = useState<KiteInterval>("day");
  const [showVolume, setShowVolume] = useState(true);
  const [volSize, setVolSize] = useState<"S" | "M" | "L">("M");
  const showRsi = indicators?.has("rsi") ?? false;
  const showMacd = indicators?.has("macd") ?? false;
  const showAtr = indicators?.has("atr") ?? false;
  const showStochastic = indicators?.has("stochastic") ?? false;
  const showObv = indicators?.has("obv") ?? false;
  const hasSubChart = showRsi || showMacd || showAtr || showStochastic || showObv;
  const [loading, setLoading] = useState(false);
  const [livePrice, setLivePrice] = useState<{ ltp: number; changePct: number } | null>(null);
  const [dataSource, setDataSource] = useState<"kite" | "mock">("mock");

  const isIntraday = interval !== "day";
  const autoIntervalRef = useRef(false);

  useEffect(() => {
    autoIntervalRef.current = false;
    pendingRangeRef.current = null;
    setInterval_(DEFAULT_INTERVAL[timeRange]);
  }, [timeRange, symbol]);

  const [kiteNonce, setKiteNonce] = useState(0);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "kite-connected") setKiteNonce((n) => n + 1);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!autoIntervalRef.current) setLoading(true);
    autoIntervalRef.current = false;
    setLivePrice(null);
    const days = TIME_RANGE_DAYS[timeRange];
    apiFetch<{ candles: OHLCVData[]; source: "kite" | "mock" }>(`/stocks/${symbol}/ohlcv?days=${days}&interval=${interval}`)
      .then((res) => {
        setOhlcv(res.candles);
        setDataSource(res.source);
      })
      .finally(() => setLoading(false));
  }, [symbol, timeRange, interval, kiteNonce]);

  const toTime = useCallback((d: string) => {
    if (!isIntraday) return d.slice(0, 10);
    // Parse as UTC so lightweight-charts displays the wall-clock time as-is (IST)
    const [datePart, timePart] = d.replace("T", " ").split(" ");
    const [y, m, day] = datePart.split("-").map(Number);
    const [h, min, s] = (timePart || "00:00:00").split(":").map(Number);
    return Math.floor(Date.UTC(y, m - 1, day, h, min, s || 0) / 1000);
  }, [isIntraday]);

  useEffect(() => {
    if (!containerRef.current || ohlcv.length === 0) return;

    const seen = new Set<string | number>();
    const unique = ohlcv.filter((d) => {
      const key = toTime(d.date);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Drop bad/outlier candles (zeros, or values wildly off the median) that
    // would otherwise blow out the y-axis autoscale and squash the real action.
    const sortedCloses = unique.map((d) => d.close).filter((c) => c > 0).sort((a, b) => a - b);
    const median = sortedCloses.length ? sortedCloses[Math.floor(sortedCloses.length / 2)] : 0;
    const deduped = median > 0
      ? unique.filter((d) => {
          const vals = [d.open, d.high, d.low, d.close];
          if (vals.some((v) => !v || v <= 0)) return false;
          return Math.max(...vals) <= median * 6 && Math.min(...vals) >= median * 0.15;
        })
      : unique;

    const isDark = document.documentElement.classList.contains("dark");

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#94a3b8" : "#64748b",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? "#1e293b" : "#e2e8f0" },
        horzLines: { color: isDark ? "#1e293b" : "#e2e8f0" },
      },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: isDark ? "#334155" : "#cbd5e1" },
      timeScale: { borderColor: isDark ? "#334155" : "#cbd5e1", timeVisible: isIntraday, secondsVisible: false },
    });
    chartRef.current = chart;

    let mainSeries: ISeriesApi<any>;
    if (chartType === "candle") {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#10b981",
        downColor: "#ef4444",
        borderUpColor: "#10b981",
        borderDownColor: "#ef4444",
        wickUpColor: "#10b981",
        wickDownColor: "#ef4444",
      });
      mainSeries.setData(
        deduped.map((d) => ({
          time: toTime(d.date) as any,
          open: d.open, high: d.high, low: d.low, close: d.close,
        }))
      );
    } else if (chartType === "line") {
      mainSeries = chart.addSeries(LineSeries, { color: "#6366f1", lineWidth: 2 });
      mainSeries.setData(deduped.map((d) => ({ time: toTime(d.date) as any, value: d.close })));
    } else if (chartType === "area") {
      mainSeries = chart.addSeries(AreaSeries, {
        lineColor: "#6366f1",
        topColor: "rgba(99,102,241,0.4)",
        bottomColor: "rgba(99,102,241,0.04)",
        lineWidth: 2,
      });
      mainSeries.setData(deduped.map((d) => ({ time: toTime(d.date) as any, value: d.close })));
    } else {
      mainSeries = chart.addSeries(BarSeries, { upColor: "#10b981", downColor: "#ef4444" });
      mainSeries.setData(
        deduped.map((d) => ({
          time: toTime(d.date) as any,
          open: d.open, high: d.high, low: d.low, close: d.close,
        }))
      );
    }
    mainSeriesRef.current = mainSeries;

    if (showVolume) {
      const volSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
      });
      const volTop = volSize === "S" ? 0.85 : volSize === "M" ? 0.7 : 0.5;
      const priceBottom = 1 - volTop;
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: volTop, bottom: 0 } });
      chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.02, bottom: priceBottom + 0.02 } });
      volSeries.setData(
        deduped.map((d) => ({
          time: toTime(d.date) as any,
          value: d.volume,
          color: d.close >= d.open ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)",
        }))
      );
      volSeriesRef.current = volSeries;
    } else {
      volSeriesRef.current = null;
      chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.02, bottom: 0.02 } });
    }

    // --- Indicator overlays ---
    if (indicators) {
      const overlays: { data: { time: string; value: number }[]; color: string; width: number }[] = [];

      if (indicators.has("sma")) {
        overlays.push({ data: sma(deduped, 20), color: "#f59e0b", width: 1 });
        overlays.push({ data: sma(deduped, 50), color: "#3b82f6", width: 1 });
      }
      if (indicators.has("ema")) {
        overlays.push({ data: ema(deduped, 9), color: "#a855f7", width: 1 });
        overlays.push({ data: ema(deduped, 21), color: "#ec4899", width: 1 });
      }
      if (indicators.has("bollinger")) {
        const bb = bollingerBands(deduped);
        overlays.push({ data: bb.upper, color: "rgba(99,102,241,0.5)", width: 1 });
        overlays.push({ data: bb.mid, color: "rgba(99,102,241,0.3)", width: 1 });
        overlays.push({ data: bb.lower, color: "rgba(99,102,241,0.5)", width: 1 });
      }
      if (indicators.has("vwap")) {
        overlays.push({ data: vwap(deduped), color: "#06b6d4", width: 2 });
      }
      if (indicators.has("supertrend")) {
        const st = supertrend(deduped);
        overlays.push({ data: st.up, color: "#10b981", width: 2 });
        overlays.push({ data: st.down, color: "#ef4444", width: 2 });
      }

      for (const o of overlays) {
        const s = chart.addSeries(LineSeries, {
          color: o.color,
          lineWidth: o.width as any,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        s.setData(o.data.map((d) => ({ ...d, time: toTime(d.time) as any })));
      }
    }

    // Signal markers (buy/sell arrows)
    if (signals && signals.length > 0) {
      createSeriesMarkers(
        mainSeries,
        signals
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((s) => ({
            time: toTime(s.date) as any,
            position: s.signal === "BUY" ? "belowBar" as const : "aboveBar" as const,
            color: s.signal === "BUY" ? "#10b981" : "#ef4444",
            shape: s.signal === "BUY" ? "arrowUp" as const : "arrowDown" as const,
            text: s.label || s.signal,
          }))
      );
    }

    // Restore the preserved zoom after an auto interval switch; otherwise fit all.
    // Do NOT clear the pending range here: the effect re-runs once with stale data
    // (on interval change) and again when the new-interval data arrives — both must
    // restore the same window. It is cleared only on a real range/symbol change.
    lastProgrammaticRef.current = Date.now();
    if (pendingRangeRef.current) {
      chart.timeScale().setVisibleRange(pendingRangeRef.current as any);
    } else {
      chart.timeScale().fitContent();
    }

    // Auto-switch interval based on how many days are visible (zoom level).
    // Only ever switch to an interval FINER than this range's default, so e.g.
    // the 1D view never coarsens away from a manually chosen 1m/5m.
    const available = AVAILABLE_INTERVALS[timeRange];
    const def = DEFAULT_INTERVAL[timeRange];
    const finerCandidates = available.filter((iv) => isFiner(iv, def));
    let zoomDebounce: ReturnType<typeof setTimeout> | null = null;
    if (finerCandidates.length > 0) {
      chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
        // Ignore events caused by our own fitContent / restore calls.
        if (Date.now() - lastProgrammaticRef.current < 250) return;
        const vr = chart.timeScale().getVisibleRange();
        if (!vr) return;
        const fromSec = timeToSec(vr.from);
        const toSec = timeToSec(vr.to);
        const spanDays = (toSec - fromSec) / 86400;

        // Pick the finest applicable interval; fall back to the default.
        let bestInterval: KiteInterval = def;
        for (const t of SPAN_THRESHOLDS) {
          if (finerCandidates.includes(t.interval) && spanDays <= t.maxSpanDays) {
            bestInterval = t.interval;
            break;
          }
        }

        if (bestInterval !== interval) {
          if (zoomDebounce) clearTimeout(zoomDebounce);
          zoomDebounce = setTimeout(() => {
            pendingRangeRef.current = { from: fromSec, to: toSec };
            autoIntervalRef.current = true;
            setInterval_(bestInterval);
          }, 350);
        }
      });
    }

    return () => {
      if (zoomDebounce) clearTimeout(zoomDebounce);
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      volSeriesRef.current = null;
    };
  }, [ohlcv, chartType, showVolume, volSize, timeRange, interval, toTime, indicators, signals]);

  useEffect(() => {
    function handleRefit() {
      const chart = chartRef.current;
      if (chart) {
        chart.timeScale().fitContent();
      }
    }
    window.addEventListener("chart-refit", handleRefit);
    return () => window.removeEventListener("chart-refit", handleRefit);
  }, []);

  useEffect(() => {
    function handleSetTimeRange(e: Event) {
      const range = (e as CustomEvent).detail as TimeRange;
      if (range) setTimeRange(range);
    }
    window.addEventListener("chart-set-timerange", handleSetTimeRange);
    return () => window.removeEventListener("chart-set-timerange", handleSetTimeRange);
  }, []);

  // Live price polling on 1D
  useEffect(() => {
    if (timeRange !== "1D") {
      setLivePrice(null);
      return;
    }

    let cancelled = false;
    let liveCandle: { time: number; open: number; high: number; low: number; close: number } | null = null;
    let prevVolume = 0;

    const poll = async () => {
      try {
        const res = await apiFetch<{ quotes: QuoteData[]; source: "kite" | "mock" }>(`/stocks/quotes?symbols=${symbol}`);
        if (cancelled || res.quotes.length === 0) return;
        setDataSource(res.source);
        if (res.source === "mock") return;
        const q = res.quotes[0];

        // Ignore bad ticks (zero / spurious) that would corrupt the live candle
        // and blow out the axis. Reference = live candle's open or last close.
        const ref = liveCandle?.open ?? ohlcv[ohlcv.length - 1]?.close ?? q.ltp;
        if (!q.ltp || q.ltp <= 0 || (ref > 0 && Math.abs(q.ltp / ref - 1) > 0.4)) {
          return;
        }
        setLivePrice({ ltp: q.ltp, changePct: q.change_pct });

        // Truncate to current minute so all ticks merge into one candle
        const n = new Date();
        const minuteTs = Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes(), 0) / 1000);

        if (!liveCandle || liveCandle.time !== minuteTs) {
          liveCandle = { time: minuteTs, open: q.ltp, high: q.ltp, low: q.ltp, close: q.ltp };
        } else {
          liveCandle.high = Math.max(liveCandle.high, q.ltp);
          liveCandle.low = Math.min(liveCandle.low, q.ltp);
          liveCandle.close = q.ltp;
        }

        const mainSeries = mainSeriesRef.current;
        if (mainSeries) {
          if (chartType === "candle" || chartType === "bar") {
            mainSeries.update({ ...liveCandle, time: liveCandle.time as any });
          } else {
            mainSeries.update({ time: minuteTs as any, value: q.ltp });
          }
        }
        if (volSeriesRef.current) {
          const minuteVol = prevVolume > 0 ? Math.max(q.volume - prevVolume, 0) : 0;
          prevVolume = q.volume;
          volSeriesRef.current.update({
            time: minuteTs as any,
            value: minuteVol,
            color: q.change_pct >= 0 ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)",
          });
        }
      } catch {
        // ignore poll errors
      }
    };

    poll();
    const id = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [timeRange, symbol, chartType]);

  const displayPrice = livePrice?.ltp ?? (ohlcv.length > 0 ? ohlcv[ohlcv.length - 1].close : null);
  const displayChange = livePrice?.changePct ??
    (ohlcv.length > 1
      ? ((ohlcv[ohlcv.length - 1].close - ohlcv[ohlcv.length - 2].close) / ohlcv[ohlcv.length - 2].close) * 100
      : 0);

  const btnClass = (active: boolean) =>
    cn(
      "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
      active
        ? "bg-indigo-600 text-white"
        : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
    );

  const intervals = AVAILABLE_INTERVALS[timeRange];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 overflow-hidden border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-200">{symbol}</span>
          {name && <span className="truncate text-xs text-slate-400">{name}</span>}
          {dataSource === "kite" ? (
            <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-500">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              LIVE
            </span>
          ) : (
            <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-500">
              HISTORICAL
            </span>
          )}
          {displayPrice !== null && (
            <>
              <span className="ml-1 text-sm font-mono font-medium text-slate-700 dark:text-slate-200">
                ₹{displayPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span className={cn(
                "text-xs font-mono font-medium",
                displayChange >= 0 ? "text-emerald-500" : "text-red-500"
              )}>
                {displayChange >= 0 ? "+" : ""}{displayChange.toFixed(2)}%
              </span>
            </>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 px-3 py-1 dark:border-slate-800">
        <select
          value={chartType}
          onChange={(e) => setChartType(e.target.value as ChartType)}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          <option value="candle">Candle</option>
          <option value="line">Line</option>
          <option value="area">Area</option>
          <option value="bar">Bar</option>
        </select>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as TimeRange)}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          {(["1D", "1W", "1M", "3M", "6M", "1Y"] as TimeRange[]).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {intervals.length > 1 && (
          <select
            value={interval}
            onChange={(e) => setInterval_(e.target.value as KiteInterval)}
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            {intervals.map((iv) => (
              <option key={iv} value={iv}>{INTERVAL_LABELS[iv]}</option>
            ))}
          </select>
        )}
        <button onClick={() => setShowVolume((v) => !v)} className={btnClass(showVolume)}>
          Vol
        </button>
        {showVolume && (
          <button
            onClick={() => setVolSize((s) => s === "S" ? "M" : s === "M" ? "L" : "S")}
            className={btnClass(true)}
          >
            {volSize}
          </button>
        )}
      </div>

      {/* Chart + Sub-charts */}
      <div className="relative flex-1 overflow-hidden min-h-0 flex flex-col">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-slate-950/50">
            <span className="text-xs text-slate-400">Loading...</span>
          </div>
        )}
        <div ref={containerRef} className="w-full" style={{ flex: hasSubChart ? "1 1 60%" : "1 1 100%", minHeight: 0 }} />
        {showRsi && (
          <div className="border-t border-slate-200 dark:border-slate-800">
            <SubChart
              label="RSI (14)"
              data={rsi(ohlcv, 14)}
              toTime={toTime}
              height={100}
              color="#f59e0b"
              levels={[30, 70]}
              range={{ min: 0, max: 100 }}
            />
          </div>
        )}
        {showMacd && (
          <div className="border-t border-slate-200 dark:border-slate-800">
            <MACDSubChart data={ohlcv} toTime={toTime} height={100} />
          </div>
        )}
        {showAtr && (
          <div className="border-t border-slate-200 dark:border-slate-800">
            <SubChart
              label="ATR (14)"
              data={atr(ohlcv, 14)}
              toTime={toTime}
              height={80}
              color="#8b5cf6"
            />
          </div>
        )}
        {showStochastic && (
          <div className="border-t border-slate-200 dark:border-slate-800">
            <StochasticSubChart data={ohlcv} toTime={toTime} height={100} />
          </div>
        )}
        {showObv && (
          <div className="border-t border-slate-200 dark:border-slate-800">
            <SubChart
              label="OBV"
              data={obv(ohlcv)}
              toTime={toTime}
              height={80}
              color="#06b6d4"
            />
          </div>
        )}
      </div>
    </div>
  );
}


interface SubChartProps {
  label: string;
  data: { time: string; value: number }[];
  toTime: (s: string) => string | number;
  height: number;
  color: string;
  levels?: number[];
  range?: { min: number; max: number };
}

function SubChart({ label, data, toTime, height, color, levels, range }: SubChartProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || data.length === 0) return;
    const isDark = document.documentElement.classList.contains("dark");
    const chart = createChart(ref.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#94a3b8" : "#64748b",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: isDark ? "#1e293b" : "#e2e8f0" },
        horzLines: { color: isDark ? "#1e293b" : "#e2e8f0" },
      },
      rightPriceScale: {
        borderColor: isDark ? "#334155" : "#cbd5e1",
        ...(range ? { autoScale: false } : {}),
      },
      timeScale: { visible: false },
      crosshair: { mode: 0 },
    });

    if (range) {
      chart.priceScale("right").applyOptions({
        autoScale: false,
        scaleMargins: { top: 0.05, bottom: 0.05 },
      });
    }

    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });
    series.setData(data.map((d) => ({ time: toTime(d.time) as any, value: d.value })));

    if (range) {
      series.applyOptions({
        autoscaleInfoProvider: () => ({
          priceRange: { minValue: range.min, maxValue: range.max },
        }),
      });
    }

    if (levels) {
      for (const lvl of levels) {
        series.createPriceLine({
          price: lvl,
          color: isDark ? "#475569" : "#94a3b8",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false,
        });
      }
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
    });
    ro.observe(ref.current);

    return () => { ro.disconnect(); chart.remove(); };
  }, [data, color, height, levels, range, toTime]);

  return (
    <div className="relative">
      <span className="absolute left-2 top-1 z-10 text-[10px] font-medium text-slate-400">{label}</span>
      <div ref={ref} style={{ height }} />
    </div>
  );
}


interface MACDSubChartProps {
  data: OHLCVData[];
  toTime: (s: string) => string | number;
  height: number;
}

function MACDSubChart({ data, toTime, height }: MACDSubChartProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || data.length === 0) return;
    const isDark = document.documentElement.classList.contains("dark");
    const { macdLine, signalLine, histogram } = macd(data);
    if (macdLine.length === 0) return;

    const chart = createChart(ref.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#94a3b8" : "#64748b",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: isDark ? "#1e293b" : "#e2e8f0" },
        horzLines: { color: isDark ? "#1e293b" : "#e2e8f0" },
      },
      rightPriceScale: { borderColor: isDark ? "#334155" : "#cbd5e1" },
      timeScale: { visible: false },
      crosshair: { mode: 0 },
    });

    const histSeries = chart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: false,
    });
    histSeries.setData(histogram.map((d) => ({
      time: toTime(d.time) as any,
      value: d.value,
      color: d.value >= 0 ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)",
    })));

    const macdSeries = chart.addSeries(LineSeries, {
      color: "#6366f1",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    macdSeries.setData(macdLine.map((d) => ({ time: toTime(d.time) as any, value: d.value })));

    const sigSeries = chart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    sigSeries.setData(signalLine.map((d) => ({ time: toTime(d.time) as any, value: d.value })));

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
    });
    ro.observe(ref.current);

    return () => { ro.disconnect(); chart.remove(); };
  }, [data, toTime, height]);

  return (
    <div className="relative">
      <span className="absolute left-2 top-1 z-10 text-[10px] font-medium text-slate-400">MACD (12,26,9)</span>
      <div ref={ref} style={{ height }} />
    </div>
  );
}


interface StochasticSubChartProps {
  data: OHLCVData[];
  toTime: (s: string) => string | number;
  height: number;
}

function StochasticSubChart({ data, toTime, height }: StochasticSubChartProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || data.length === 0) return;
    const isDark = document.documentElement.classList.contains("dark");
    const { k: kLine, d: dLine } = stochastic(data);
    if (kLine.length === 0) return;

    const chart = createChart(ref.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#94a3b8" : "#64748b",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: isDark ? "#1e293b" : "#e2e8f0" },
        horzLines: { color: isDark ? "#1e293b" : "#e2e8f0" },
      },
      rightPriceScale: {
        borderColor: isDark ? "#334155" : "#cbd5e1",
        autoScale: false,
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
      timeScale: { visible: false },
      crosshair: { mode: 0 },
    });

    const kSeries = chart.addSeries(LineSeries, {
      color: "#6366f1",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });
    kSeries.setData(kLine.map((d) => ({ time: toTime(d.time) as any, value: d.value })));
    kSeries.applyOptions({
      autoscaleInfoProvider: () => ({
        priceRange: { minValue: 0, maxValue: 100 },
      }),
    });

    for (const lvl of [20, 80]) {
      kSeries.createPriceLine({
        price: lvl,
        color: isDark ? "#475569" : "#94a3b8",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
      });
    }

    const dSeries = chart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    dSeries.setData(dLine.map((d) => ({ time: toTime(d.time) as any, value: d.value })));

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
    });
    ro.observe(ref.current);

    return () => { ro.disconnect(); chart.remove(); };
  }, [data, toTime, height]);

  return (
    <div className="relative">
      <span className="absolute left-2 top-1 z-10 text-[10px] font-medium text-slate-400">Stoch (14,3)</span>
      <div ref={ref} style={{ height }} />
    </div>
  );
}
