import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  AreaSeries,
} from "lightweight-charts";

interface DrawdownPoint {
  date: string;
  drawdown: number;
}

interface DrawdownChartProps {
  data: DrawdownPoint[];
  height?: number;
}

export function DrawdownChart({ data, height = 160 }: DrawdownChartProps) {
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
      rightPriceScale: {
        borderColor: isDark ? "#334155" : "#cbd5e1",
        invertScale: true,
      },
      timeScale: { borderColor: isDark ? "#334155" : "#cbd5e1" },
      crosshair: { mode: 0 },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#ef4444",
      topColor: "rgba(239,68,68,0.01)",
      bottomColor: "rgba(239,68,68,0.35)",
      lineWidth: 1,
      invertFilledArea: true,
    });
    series.setData(
      data.map((d) => ({ time: d.date.slice(0, 10) as any, value: d.drawdown }))
    );

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); };
  }, [data, height]);

  if (data.length === 0) {
    return <div className="py-4 text-center text-xs text-slate-400">No drawdown data</div>;
  }

  const maxDD = Math.max(...data.map((d) => d.drawdown));

  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-[10px] font-medium text-slate-400">
        <span>Underwater Chart (Drawdown %)</span>
        <span className="text-red-400">Max: -{maxDD.toFixed(2)}%</span>
      </div>
      <div ref={containerRef} />
    </div>
  );
}
