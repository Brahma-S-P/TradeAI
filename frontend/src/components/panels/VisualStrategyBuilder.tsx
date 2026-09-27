import { useState } from "react";
import { Plus, Trash2, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ConditionRow {
  indicator: string;
  operator: string;
  value: number;
}

export interface RiskConfig {
  stop_loss_pct: number;
  target_pct: number;
  trailing_stop: boolean;
}

export interface ConditionTree {
  entry: ConditionRow[];
  exit: ConditionRow[];
  risk: RiskConfig;
}

const INDICATORS = [
  { key: "rsi_14", label: "RSI (14)", group: "Momentum" },
  { key: "rsi_7", label: "RSI (7)", group: "Momentum" },
  { key: "rsi_21", label: "RSI (21)", group: "Momentum" },
  { key: "macd", label: "MACD", group: "Momentum" },
  { key: "roc_12", label: "ROC (12)", group: "Momentum" },
  { key: "roc_20", label: "ROC (20)", group: "Momentum" },
  { key: "price_vs_sma20", label: "Price vs SMA 20 (%)", group: "Trend" },
  { key: "price_vs_sma50", label: "Price vs SMA 50 (%)", group: "Trend" },
  { key: "price_vs_sma200", label: "Price vs SMA 200 (%)", group: "Trend" },
  { key: "sma20_vs_sma50", label: "SMA 20 vs SMA 50 (%)", group: "Trend" },
  { key: "sma50_vs_sma200", label: "SMA 50 vs SMA 200 (%)", group: "Trend" },
  { key: "adx_14", label: "ADX (14)", group: "Trend" },
  { key: "atr_percentage", label: "ATR %", group: "Volatility" },
  { key: "historical_volatility_20d", label: "Hist Vol 20D", group: "Volatility" },
  { key: "rvol", label: "Rel Volume", group: "Volume" },
  { key: "volume_ratio_5d", label: "Vol Ratio 5D", group: "Volume" },
  { key: "obv", label: "OBV", group: "Volume" },
  { key: "return_1d", label: "Return 1D (%)", group: "Returns" },
  { key: "return_5d", label: "Return 5D (%)", group: "Returns" },
  { key: "return_20d", label: "Return 20D (%)", group: "Returns" },
  { key: "breakout_20d", label: "20D Breakout", group: "Price Action" },
  { key: "breakout_52w", label: "52W Breakout", group: "Price Action" },
  { key: "stochastic_k", label: "Stoch %K", group: "Momentum" },
  { key: "stochastic_d", label: "Stoch %D", group: "Momentum" },
];

const OPERATORS = [
  { key: ">", label: ">" },
  { key: ">=", label: ">=" },
  { key: "<", label: "<" },
  { key: "<=", label: "<=" },
  { key: "=", label: "=" },
  { key: "!=", label: "!=" },
];

const DEFAULT_RISK: RiskConfig = { stop_loss_pct: 3, target_pct: 6, trailing_stop: false };

function newCondition(): ConditionRow {
  return { indicator: "rsi_14", operator: "<", value: 30 };
}

interface VisualStrategyBuilderProps {
  conditions: ConditionTree;
  onChange: (c: ConditionTree) => void;
  onRun: () => void;
  running?: boolean;
}

function ConditionEditor({
  label,
  rows,
  onChange,
  joinLabel,
}: {
  label: string;
  rows: ConditionRow[];
  onChange: (rows: ConditionRow[]) => void;
  joinLabel: string;
}) {
  function updateRow(i: number, patch: Partial<ConditionRow>) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  }

  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <button
          onClick={() => onChange([...rows, newCondition()])}
          className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950"
        >
          <Plus size={10} /> Add
        </button>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && (
            <span className="w-6 text-center text-[9px] font-bold text-slate-400">{joinLabel}</span>
          )}
          <select
            value={row.indicator}
            onChange={(e) => updateRow(i, { indicator: e.target.value })}
            className="flex-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {INDICATORS.map((ind) => (
              <option key={ind.key} value={ind.key}>
                {ind.label}
              </option>
            ))}
          </select>
          <select
            value={row.operator}
            onChange={(e) => updateRow(i, { operator: e.target.value })}
            className="w-12 rounded border border-slate-200 bg-white px-1 py-1 text-center text-[11px] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {OPERATORS.map((op) => (
              <option key={op.key} value={op.key}>
                {op.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={row.value}
            onChange={(e) => updateRow(i, { value: Number(e.target.value) })}
            className="w-16 rounded border border-slate-200 bg-white px-1.5 py-1 text-right text-[11px] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
          <button
            onClick={() => removeRow(i)}
            className="rounded p-0.5 text-slate-400 hover:text-red-500"
          >
            <Trash2 size={11} />
          </button>
        </div>
      ))}
      {rows.length === 0 && (
        <div className="py-1 text-center text-[10px] text-slate-400">No conditions. Click Add.</div>
      )}
    </div>
  );
}

export function VisualStrategyBuilder({ conditions, onChange, onRun, running }: VisualStrategyBuilderProps) {
  const risk = conditions.risk ?? DEFAULT_RISK;

  function updateRisk(patch: Partial<RiskConfig>) {
    onChange({ ...conditions, risk: { ...risk, ...patch } });
  }

  function handleReset() {
    onChange({ entry: [newCondition()], exit: [{ indicator: "rsi_14", operator: ">", value: 70 }], risk: DEFAULT_RISK });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-auto p-2.5">
        <ConditionEditor
          label="Entry Conditions (all must be true)"
          rows={conditions.entry}
          onChange={(entry) => onChange({ ...conditions, entry })}
          joinLabel="AND"
        />

        <div className="border-t border-slate-200 dark:border-slate-700" />

        <ConditionEditor
          label="Exit Conditions (any triggers sell)"
          rows={conditions.exit}
          onChange={(exit) => onChange({ ...conditions, exit })}
          joinLabel="OR"
        />

        <div className="border-t border-slate-200 dark:border-slate-700" />

        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Risk Management</span>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
              Stop Loss %
              <input
                type="number"
                value={risk.stop_loss_pct}
                onChange={(e) => updateRisk({ stop_loss_pct: Number(e.target.value) })}
                className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-[11px] dark:border-slate-700 dark:bg-slate-800"
                min={0}
                step={0.5}
              />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
              Target %
              <input
                type="number"
                value={risk.target_pct}
                onChange={(e) => updateRisk({ target_pct: Number(e.target.value) })}
                className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-[11px] dark:border-slate-700 dark:bg-slate-800"
                min={0}
                step={0.5}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 px-2.5 py-1.5 dark:border-slate-800">
        <button
          onClick={handleReset}
          className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          <RotateCcw size={11} /> Reset
        </button>
        <button
          onClick={onRun}
          disabled={running || (conditions.entry.length === 0 && conditions.exit.length === 0)}
          className={cn(
            "flex items-center gap-1 rounded-md px-3 py-1 text-[11px] font-medium transition-colors",
            "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          )}
        >
          <Play size={11} />
          {running ? "Running..." : "Run Visual"}
        </button>
      </div>
    </div>
  );
}
