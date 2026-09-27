import { useEffect, useRef, useState } from "react";
import { createChart, type IChartApi, ColorType, CandlestickSeries, LineSeries, HistogramSeries } from "lightweight-charts";
import { apiFetch } from "@/lib/api";

interface OHLCVData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CandlestickChartProps {
  symbol: string;
  indicators: Set<string>;
}

function sma(data: OHLCVData[], period: number) {
  const result: { time: string; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((s, d) => s + d.close, 0) / period;
    result.push({ time: data[i].date, value: parseFloat(avg.toFixed(2)) });
  }
  return result;
}

function ema(data: OHLCVData[], period: number) {
  const result: { time: string; value: number }[] = [];
  const k = 2 / (period + 1);
  let prev = data.slice(0, period).reduce((s, d) => s + d.close, 0) / period;
  result.push({ time: data[period - 1].date, value: parseFloat(prev.toFixed(2)) });
  for (let i = period; i < data.length; i++) {
    prev = data[i].close * k + prev * (1 - k);
    result.push({ time: data[i].date, value: parseFloat(prev.toFixed(2)) });
  }
  return result;
}

function bollingerBands(data: OHLCVData[], period: number = 20, mult: number = 2) {
  const upper: { time: string; value: number }[] = [];
  const lower: { time: string; value: number }[] = [];
  const mid: { time: string; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((s, d) => s + d.close, 0) / period;
    const stdDev = Math.sqrt(slice.reduce((s, d) => s + (d.close - avg) ** 2, 0) / period);
    mid.push({ time: data[i].date, value: parseFloat(avg.toFixed(2)) });
    upper.push({ time: data[i].date, value: parseFloat((avg + mult * stdDev).toFixed(2)) });
    lower.push({ time: data[i].date, value: parseFloat((avg - mult * stdDev).toFixed(2)) });
  }
  return { upper, mid, lower };
}

function vwap(data: OHLCVData[]) {
  let cumVol = 0;
  let cumTP = 0;
  return data.map((d) => {
    const tp = (d.high + d.low + d.close) / 3;
    cumTP += tp * d.volume;
    cumVol += d.volume;
    return { time: d.date, value: parseFloat((cumTP / cumVol).toFixed(2)) };
  });
}

export function CandlestickChart({ symbol, indicators }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [ohlcv, setOhlcv] = useState<OHLCVData[]>([]);

  useEffect(() => {
    apiFetch<{ candles: OHLCVData[]; source: string }>(`/stocks/${symbol}/ohlcv?days=90`).then((res) => setOhlcv(res.candles));
  }, [symbol]);

  useEffect(() => {
    if (!containerRef.current || ohlcv.length === 0) return;

    const isDark = document.documentElement.classList.contains("dark");

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: isDark ? "#020617" : "#f8fafc" },
        textColor: isDark ? "#94a3b8" : "#64748b",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? "#1e293b" : "#e2e8f0" },
        horzLines: { color: isDark ? "#1e293b" : "#e2e8f0" },
      },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: isDark ? "#334155" : "#cbd5e1" },
      timeScale: { borderColor: isDark ? "#334155" : "#cbd5e1", timeVisible: false },
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
      ohlcv.map((d) => ({
        time: d.date as any,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
    );

    if (indicators.has("volume")) {
      const volSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
      });
      chart.priceScale("vol").applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      volSeries.setData(
        ohlcv.map((d) => ({
          time: d.date as any,
          value: d.volume,
          color: d.close >= d.open ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)",
        }))
      );
    }

    const overlays: { data: { time: string; value: number }[]; color: string; width: number }[] = [];

    if (indicators.has("sma")) {
      overlays.push({ data: sma(ohlcv, 20), color: "#f59e0b", width: 1 });
      overlays.push({ data: sma(ohlcv, 50), color: "#3b82f6", width: 1 });
    }
    if (indicators.has("ema")) {
      overlays.push({ data: ema(ohlcv, 9), color: "#a855f7", width: 1 });
      overlays.push({ data: ema(ohlcv, 21), color: "#ec4899", width: 1 });
    }
    if (indicators.has("bollinger")) {
      const bb = bollingerBands(ohlcv);
      overlays.push({ data: bb.upper, color: "rgba(99,102,241,0.5)", width: 1 });
      overlays.push({ data: bb.mid, color: "rgba(99,102,241,0.3)", width: 1 });
      overlays.push({ data: bb.lower, color: "rgba(99,102,241,0.5)", width: 1 });
    }
    if (indicators.has("vwap")) {
      overlays.push({ data: vwap(ohlcv), color: "#06b6d4", width: 2 });
    }

    for (const o of overlays) {
      const series = chart.addSeries(LineSeries, {
        color: o.color,
        lineWidth: o.width as any,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      series.setData(o.data.map((d) => ({ ...d, time: d.time as any })));
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [ohlcv, indicators, symbol]);

  return <div ref={containerRef} className="h-full w-full" />;
}
