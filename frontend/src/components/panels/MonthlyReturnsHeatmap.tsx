import { useMemo } from "react";
import { cn } from "@/lib/cn";

interface MonthlyReturn {
  year: number;
  month: number;
  return_pct: number;
  start_value: number;
  end_value: number;
}

interface MonthlyReturnsHeatmapProps {
  data: MonthlyReturn[];
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getColor(val: number): string {
  if (val >= 10) return "bg-emerald-600 text-white";
  if (val >= 5) return "bg-emerald-500 text-white";
  if (val >= 2) return "bg-emerald-400 text-white";
  if (val >= 0.5) return "bg-emerald-300 text-emerald-900";
  if (val >= -0.5) return "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300";
  if (val >= -2) return "bg-red-300 text-red-900";
  if (val >= -5) return "bg-red-400 text-white";
  if (val >= -10) return "bg-red-500 text-white";
  return "bg-red-600 text-white";
}

export function MonthlyReturnsHeatmap({ data }: MonthlyReturnsHeatmapProps) {
  const { years, grid } = useMemo(() => {
    const grid = new Map<string, MonthlyReturn>();
    const yearSet = new Set<number>();
    for (const d of data) {
      grid.set(`${d.year}-${d.month}`, d);
      yearSet.add(d.year);
    }
    const years = Array.from(yearSet).sort();
    return { years, grid };
  }, [data]);

  if (data.length === 0) {
    return <div className="py-4 text-center text-xs text-slate-400">No monthly return data</div>;
  }

  const yearlyReturns = useMemo(() => {
    const map = new Map<number, number>();
    for (const year of years) {
      const monthsInYear = data.filter((d) => d.year === year);
      if (monthsInYear.length === 0) continue;
      const compounded = monthsInYear.reduce((acc, m) => acc * (1 + m.return_pct / 100), 1);
      map.set(year, (compounded - 1) * 100);
    }
    return map;
  }, [data, years]);

  return (
    <div>
      <div className="mb-2 text-[10px] font-medium text-slate-400">Monthly Returns Heatmap</div>
      <div className="overflow-x-auto">
        <table className="w-full text-center">
          <thead>
            <tr>
              <th className="px-1.5 py-1 text-[10px] font-medium text-slate-400">Year</th>
              {MONTH_LABELS.map((m) => (
                <th key={m} className="px-1 py-1 text-[10px] font-medium text-slate-400">{m}</th>
              ))}
              <th className="px-1.5 py-1 text-[10px] font-medium text-slate-400">Total</th>
            </tr>
          </thead>
          <tbody>
            {years.map((year) => {
              const yearTotal = yearlyReturns.get(year) ?? 0;
              return (
                <tr key={year}>
                  <td className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{year}</td>
                  {Array.from({ length: 12 }, (_, i) => {
                    const entry = grid.get(`${year}-${i + 1}`);
                    if (!entry) {
                      return <td key={i} className="px-1 py-0.5"><span className="text-[10px] text-slate-300 dark:text-slate-700">—</span></td>;
                    }
                    return (
                      <td key={i} className="px-0.5 py-0.5">
                        <span
                          className={cn(
                            "inline-block w-full rounded px-1 py-0.5 text-[10px] font-mono font-medium",
                            getColor(entry.return_pct)
                          )}
                          title={`${MONTH_LABELS[i]} ${year}: ${entry.return_pct >= 0 ? "+" : ""}${entry.return_pct.toFixed(2)}%`}
                        >
                          {entry.return_pct >= 0 ? "+" : ""}{entry.return_pct.toFixed(1)}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-0.5 py-0.5">
                    <span
                      className={cn(
                        "inline-block w-full rounded px-1 py-0.5 text-[10px] font-mono font-bold",
                        getColor(yearTotal)
                      )}
                    >
                      {yearTotal >= 0 ? "+" : ""}{yearTotal.toFixed(1)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
