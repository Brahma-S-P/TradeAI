import { useEffect, useState } from "react";
import { BookOpen, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { ConditionTree } from "./VisualStrategyBuilder";

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  conditions: ConditionTree;
}

interface StrategyTemplateLibraryProps {
  onLoad: (conditions: ConditionTree) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Mean Reversion": "bg-blue-500/10 text-blue-500",
  "Trend Following": "bg-emerald-500/10 text-emerald-500",
  "Breakout": "bg-amber-500/10 text-amber-500",
  "Volatility": "bg-purple-500/10 text-purple-500",
  "Momentum": "bg-rose-500/10 text-rose-500",
};

export function StrategyTemplateLibrary({ onLoad }: StrategyTemplateLibraryProps) {
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    apiFetch<Template[]>("/analyzer/templates")
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  if (templates.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-slate-400">
        <BookOpen size={14} className="mr-1.5" /> Loading templates...
      </div>
    );
  }

  const grouped = templates.reduce<Record<string, Template[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-3 p-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Strategy Templates
      </div>
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="space-y-1">
          <span
            className={cn(
              "inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase",
              CATEGORY_COLORS[category] || "bg-slate-500/10 text-slate-500"
            )}
          >
            {category}
          </span>
          {items.map((t) => (
            <button
              key={t.id}
              onClick={() => onLoad(t.conditions)}
              className="group flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {t.name}
                </div>
                <div className="text-[10px] text-slate-400 line-clamp-2">
                  {t.description}
                </div>
              </div>
              <ArrowRight
                size={13}
                className="ml-2 shrink-0 text-slate-300 transition-colors group-hover:text-indigo-500"
              />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
