import { cn } from "@/lib/cn";

interface Metrics {
  initial_capital?: number;
  final_value?: number;
  total_return?: number;
  total_return_pct?: number;
  total_trades?: number;
  winning_trades?: number;
  losing_trades?: number;
  win_rate?: number;
  avg_win?: number;
  avg_loss?: number;
  avg_win_loss_ratio?: number;
  profit_factor?: number;
  max_drawdown?: number;
  max_drawdown_pct?: number;
  max_drawdown_duration?: number;
  sharpe_ratio?: number;
  sortino_ratio?: number;
  calmar_ratio?: number;
  expectancy?: number;
  total_commissions?: number;
  best_trade?: number;
  worst_trade?: number;
  avg_holding_bars?: number;
  max_consecutive_wins?: number;
  max_consecutive_losses?: number;
  long_trades?: number;
  short_trades?: number;
  long_pnl?: number;
  short_pnl?: number;
  time_in_market_pct?: number;
  gross_profit?: number;
  gross_loss?: number;
}

interface PerformanceDashboardProps {
  metrics: Metrics;
}

type Format = "pct" | "currency" | "ratio" | "number" | "days" | "bars";

interface TileConfig {
  key: keyof Metrics;
  label: string;
  format?: Format;
  good?: "high" | "low";
  highlight?: boolean;
}

interface SectionConfig {
  title: string;
  icon: string;
  tiles: TileConfig[];
}

const SECTIONS: SectionConfig[] = [
  {
    title: "Returns",
    icon: "📈",
    tiles: [
      { key: "total_return_pct", label: "Total Return", format: "pct", good: "high", highlight: true },
      { key: "total_return", label: "Net P&L", format: "currency", good: "high", highlight: true },
      { key: "initial_capital", label: "Initial Capital", format: "currency" },
      { key: "final_value", label: "Final Value", format: "currency", good: "high" },
      { key: "gross_profit", label: "Gross Profit", format: "currency", good: "high" },
      { key: "gross_loss", label: "Gross Loss", format: "currency", good: "low" },
    ],
  },
  {
    title: "Risk",
    icon: "🛡️",
    tiles: [
      { key: "max_drawdown", label: "Max Drawdown", format: "pct", good: "low", highlight: true },
      { key: "sharpe_ratio", label: "Sharpe Ratio", format: "ratio", good: "high", highlight: true },
      { key: "sortino_ratio", label: "Sortino Ratio", format: "ratio", good: "high" },
      { key: "calmar_ratio", label: "Calmar Ratio", format: "ratio", good: "high" },
      { key: "max_drawdown_duration", label: "Max DD Duration", format: "days", good: "low" },
      { key: "total_commissions", label: "Total Commissions", format: "currency", good: "low" },
    ],
  },
  {
    title: "Trade Stats",
    icon: "📊",
    tiles: [
      { key: "total_trades", label: "Total Trades", format: "number", highlight: true },
      { key: "win_rate", label: "Win Rate", format: "pct", good: "high", highlight: true },
      { key: "winning_trades", label: "Winners", format: "number", good: "high" },
      { key: "losing_trades", label: "Losers", format: "number", good: "low" },
      { key: "profit_factor", label: "Profit Factor", format: "ratio", good: "high" },
      { key: "expectancy", label: "Expectancy", format: "currency", good: "high" },
    ],
  },
  {
    title: "Trade Analysis",
    icon: "🔍",
    tiles: [
      { key: "best_trade", label: "Best Trade", format: "currency", good: "high" },
      { key: "worst_trade", label: "Worst Trade", format: "currency", good: "high" },
      { key: "avg_win", label: "Avg Win", format: "currency", good: "high" },
      { key: "avg_loss", label: "Avg Loss", format: "currency", good: "low" },
      { key: "avg_win_loss_ratio", label: "Win/Loss Ratio", format: "ratio", good: "high" },
      { key: "avg_holding_bars", label: "Avg Holding", format: "bars" },
    ],
  },
  {
    title: "Streaks & Exposure",
    icon: "⚡",
    tiles: [
      { key: "max_consecutive_wins", label: "Max Consec. Wins", format: "number", good: "high" },
      { key: "max_consecutive_losses", label: "Max Consec. Losses", format: "number", good: "low" },
      { key: "time_in_market_pct", label: "Time in Market", format: "pct" },
      { key: "long_trades", label: "Long Trades", format: "number" },
      { key: "short_trades", label: "Short Trades", format: "number" },
      { key: "long_pnl", label: "Long P&L", format: "currency", good: "high" },
      { key: "short_pnl", label: "Short P&L", format: "currency", good: "high" },
    ],
  },
];

function formatValue(val: number | undefined, format?: Format): string {
  if (val === undefined || val === null) return "—";
  switch (format) {
    case "pct": return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
    case "currency": return `₹${val.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    case "ratio": return val.toFixed(2);
    case "days": return `${val} days`;
    case "bars": return `${val.toFixed(1)} bars`;
    default: return val.toString();
  }
}

function getColor(val: number | undefined, good?: "high" | "low"): string {
  if (val === undefined || val === null || !good) return "text-slate-300 dark:text-slate-400";
  if (good === "high") {
    if (val > 0) return "text-emerald-400";
    if (val < 0) return "text-red-400";
    return "text-slate-400";
  }
  // "low" is good — higher values are worse
  if (good === "low") {
    if (val > 10) return "text-red-400";
    if (val > 3) return "text-amber-400";
    return "text-emerald-400";
  }
  return "text-slate-400";
}

export function PerformanceDashboard({ metrics }: PerformanceDashboardProps) {
  return (
    <div className="space-y-3">
      {SECTIONS.map((section) => {
        const visibleTiles = section.tiles.filter(
          (t) => metrics[t.key] !== undefined && metrics[t.key] !== null
        );
        if (visibleTiles.length === 0) return null;
        return (
          <div key={section.title}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span>{section.icon}</span>
              {section.title}
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
              {visibleTiles.map((tile) => {
                const val = metrics[tile.key] as number | undefined;
                return (
                  <div
                    key={tile.key}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5",
                      tile.highlight
                        ? "border-indigo-500/30 bg-indigo-950/20 dark:border-indigo-500/20 dark:bg-indigo-950/30"
                        : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/50"
                    )}
                  >
                    <div className="text-[9px] font-medium uppercase tracking-wide text-slate-400">
                      {tile.label}
                    </div>
                    <div
                      className={cn(
                        "mt-0.5 font-mono font-semibold",
                        tile.highlight ? "text-base" : "text-sm",
                        getColor(val, tile.good)
                      )}
                    >
                      {formatValue(val, tile.format)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
