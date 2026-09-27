import { useRef, useState, useCallback, memo } from "react";
import { GripVertical, X, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/cn";
import { StockChartPanel } from "./StockChartPanel";

export interface MultiChartItem {
  id: string;
  symbol: string;
  name?: string;
}

interface MultiChartGridProps {
  charts: MultiChartItem[];
  onRemove: (id: string) => void;
  onReorder: (charts: MultiChartItem[]) => void;
  highlightId?: string | null;
  indicators?: Set<string>;
}

const ChartCard = memo(function ChartCard({
  item,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
  isHighlighted,
  indicators,
}: {
  item: MultiChartItem;
  onRemove: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, id: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  isDragOver: boolean;
  isHighlighted: boolean;
  indicators?: Set<string>;
}) {
  return (
    <div
      id={`multi-chart-${item.id}`}
      className={cn(
        "relative flex flex-col rounded-lg border bg-white dark:bg-slate-950 transition-all",
        isDragOver
          ? "border-indigo-500 ring-2 ring-indigo-500/50"
          : isHighlighted
            ? "border-amber-400 ring-2 ring-amber-400/50"
            : "border-slate-200 dark:border-slate-800"
      )}
      onDragOver={(e) => onDragOver(e, item.id)}
      onDrop={(e) => onDrop(e, item.id)}
      style={{ height: 420 }}
    >
      <div
        className="flex shrink-0 cursor-grab items-center gap-1 border-b border-slate-200 px-2 py-1 active:cursor-grabbing dark:border-slate-800"
        draggable
        onDragStart={(e) => onDragStart(e, item.id)}
        onDragEnd={onDragEnd}
      >
        <GripVertical size={12} className="shrink-0 text-slate-300 dark:text-slate-600" />
        <span className="flex-1 truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">
          {item.symbol}{item.name ? ` — ${item.name}` : ""}
        </span>
        <button
          onClick={() => onRemove(item.id)}
          className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950 dark:hover:text-red-400"
          title="Remove chart"
        >
          <X size={12} />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <StockChartPanel
          symbol={item.symbol}
          name={item.name}
          indicators={indicators}
        />
      </div>
    </div>
  );
});

export function MultiChartGrid({ charts, onRemove, onReorder, highlightId, indicators }: MultiChartGridProps) {
  const dragIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    (e.target as HTMLElement).closest("[draggable]")!.style.opacity = "0.5";
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).closest("[draggable]")!.style.opacity = "";
    dragIdRef.current = null;
    setDragOverId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIdRef.current && dragIdRef.current !== id) {
      setDragOverId(id);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const draggedId = dragIdRef.current;
    dragIdRef.current = null;
    if (!draggedId || draggedId === targetId) return;

    const fromIdx = charts.findIndex((c) => c.id === draggedId);
    const toIdx = charts.findIndex((c) => c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const next = [...charts];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onReorder(next);
  }, [charts, onReorder]);

  if (charts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
        <LayoutGrid size={32} className="text-slate-300 dark:text-slate-600" />
        <div className="text-center">
          <div className="text-sm font-medium">Multi-Chart Workspace</div>
          <div className="mt-1 text-xs">Click a stock from the Watchlist to add it here.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-2 [scrollbar-width:thin]">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {charts.map((item) => (
          <ChartCard
            key={item.id}
            item={item}
            onRemove={onRemove}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            isDragOver={dragOverId === item.id}
            isHighlighted={highlightId === item.id}
            indicators={indicators}
          />
        ))}
      </div>
    </div>
  );
}
