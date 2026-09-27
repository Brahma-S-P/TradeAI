import { useState } from "react";
import { Undo2, Redo2, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { IndicatorScorecard } from "./IndicatorScorecard";
import { ComparisonView } from "./ComparisonView";
import { NotesPanel } from "./NotesPanel";
import { SignalsPanel, type SignalResult } from "./SignalsPanel";



import { CurrentSignalBadge } from "./CurrentSignalBadge";

interface AnalyzerTabsProps {
  selectedSymbol: string | null;
  selectedSymbols: string[];
  notes: string;
  onNotesChange: (v: string) => void;
  onClearSymbols: () => void;
  onUndoSymbols: () => void;
  onRedoSymbols: () => void;
  canUndo: boolean;
  canRedo: boolean;
  signalResults?: SignalResult[];
  onSignalSelectStock?: (symbol: string) => void;
  code?: string;
  onSummarize?: () => void;
}

const TABS = ["Scorecard", "Signals", "Comparison", "Notes"] as const;
type Tab = (typeof TABS)[number];

export function AnalyzerTabs({ selectedSymbol, selectedSymbols, notes, onNotesChange, onClearSymbols, onUndoSymbols, onRedoSymbols, canUndo, canRedo, signalResults = [], onSignalSelectStock, code, onSummarize }: AnalyzerTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Scorecard");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-1 dark:border-slate-800">
        <div className="flex items-center gap-0.5">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                activeTab === tab
                  ? "bg-indigo-600 text-white"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              )}
            >
              {tab}
              {tab === "Signals" && signalResults.length > 0 && (
                <span className="ml-1 rounded-full bg-indigo-500/20 px-1 text-[9px]">{signalResults.length}</span>
              )}
            </button>
          ))}
        </div>
        {activeTab === "Signals" && signalResults.length > 0 && onSummarize && (
          <button
            onClick={onSummarize}
            className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-700"
          >
            <Sparkles size={10} />
            Summarize with AI
          </button>
        )}
        {activeTab === "Comparison" && selectedSymbols.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={onUndoSymbols}
              disabled={!canUndo}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed dark:hover:bg-slate-800"
              title="Undo"
            >
              <Undo2 size={13} />
            </button>
            <button
              onClick={onRedoSymbols}
              disabled={!canRedo}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed dark:hover:bg-slate-800"
              title="Redo"
            >
              <Redo2 size={13} />
            </button>
            <button
              onClick={onClearSymbols}
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
              title="Clear selection"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3">
        {activeTab === "Scorecard" && (
          <>
            {code && selectedSymbol && (
              <div className="mb-3">
                <CurrentSignalBadge symbol={selectedSymbol} code={code} />
              </div>
            )}
            <IndicatorScorecard symbol={selectedSymbol} />
          </>
        )}
        {activeTab === "Signals" && (
          <SignalsPanel signals={signalResults} onSelectStock={onSignalSelectStock} />
        )}
{activeTab === "Comparison" && (
          <ComparisonView stocks={selectedSymbols} />
        )}
        {activeTab === "Notes" && (
          <NotesPanel value={notes} onChange={onNotesChange} stockSymbol={selectedSymbol ?? undefined} />
        )}
      </div>
    </div>
  );
}
