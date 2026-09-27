import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  AreaSeries,
  LineSeries,
} from "lightweight-charts";

interface EquityPoint {
  date: string;
  value: number;
}

interface EquityCurveChartProps {
  data: EquityPoint[];
  benchmarkData?: EquityPoint[];
  initialCapital: number;
  height?: number;
}

export function EquityCurveChart({ data, benchmarkData, initialCapital, height = 200 }: EquityCurveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;
    const isDark = document.documentElement.classList.contains("dark");

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

    const isProfit = data.length > 0 && data[data.length - 1].value >= initialCapital;

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: isProfit ? "#10b981" : "#ef4444",
      topColor: isProfit ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)",
      bottomColor: isProfit ? "rgba(16,185,129,0.02)" : "rgba(239,68,68,0.02)",
      lineWidth: 2,
      title: "Strategy",
    });
    areaSeries.setData(
      data.map((d) => ({ time: d.date.slice(0, 10) as any, value: d.value }))
    );

    if (benchmarkData && benchmarkData.length > 0) {
      const benchSeries = chart.addSeries(LineSeries, {
        color: isDark ? "#f59e0b" : "#d97706",
        lineWidth: 1,
        lineStyle: 2,
        title: "Buy & Hold",
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
      });
      benchSeries.setData(
        benchmarkData.map((d) => ({ time: d.date.slice(0, 10) as any, value: d.value }))
      );
    }

    const baselineSeries = chart.addSeries(LineSeries, {
      color: isDark ? "#475569" : "#94a3b8",
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    baselineSeries.setData(
      data.map((d) => ({ time: d.date.slice(0, 10) as any, value: initialCapital }))
    );

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); };
  }, [data, benchmarkData, initialCapital, height]);

  return (
    <div>
      <div className="mb-1 flex items-center gap-3 text-[10px] font-medium text-slate-400">
        <span>Equity Curve</span>
        {benchmarkData && benchmarkData.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 bg-amber-500" style={{ borderTop: "1px dashed" }} />
            Buy & Hold Benchmark
          </span>
        )}
      </div>
      <div ref={containerRef} />
    </div>
  );
}
