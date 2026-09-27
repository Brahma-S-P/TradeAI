import { useRef, useState } from "react";
import { FileCode, Folder, FolderPlus, X, ChevronDown, GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";

export interface BarStrategy {
  id: string;
  name: string;
  strategy_type: string;
  folder_id: number | null;
  position: number;
  version: number;
  version_count: number;
  updated_at: string;
}

export interface BarFolder {
  id: number;
  name: string;
  position: number;
}

interface ReorderItem {
  type: "strategy" | "folder";
  id: number;
  position: number;
}

interface StrategyBookmarksBarProps {
  strategies: BarStrategy[];
  folders: BarFolder[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateFolder: (name: string) => void;
  onDeleteFolder: (id: number) => void;
  onMoveStrategy: (id: string, folderId: number | null, position: number) => void;
  onReorder: (items: ReorderItem[]) => void;
}

type BarItem =
  | { kind: "folder"; key: string; position: number; folder: BarFolder }
  | { kind: "strategy"; key: string; position: number; strategy: BarStrategy };

type DragData = { kind: "folder"; id: number } | { kind: "strategy"; id: string };

function typeBadge(type: string) {
  if (type === "manual")
    return { label: "Manual", cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400" };
  if (type === "code")
    return { label: "Code", cls: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400" };
  return { label: type, cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" };
}

function typeDotColor(type: string) {
  if (type === "manual") return "bg-indigo-500";
  if (type === "code") return "bg-purple-500";
  return "bg-slate-400";
}

export function StrategyBookmarksBar({
  strategies,
  folders,
  selectedId,
  onSelect,
  onDelete,
  onCreateFolder,
  onDeleteFolder,
  onMoveStrategy,
  onReorder,
}: StrategyBookmarksBarProps) {
  const [openFolder, setOpenFolder] = useState<number | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<
    { type: "strategy"; id: string } | { type: "folder"; id: number } | null
  >(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; side: "left" | "right" } | null>(null);
  const [dropOnFolder, setDropOnFolder] = useState<number | null>(null);
  const dragDataRef = useRef<DragData | null>(null);

  const rootStrategies = strategies.filter((s) => s.folder_id == null);

  // Unified bar items: folders + root strategies, sorted by position
  const barItems: BarItem[] = [
    ...folders
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((f): BarItem => ({ kind: "folder", key: `f-${f.id}`, position: f.position, folder: f })),
    ...rootStrategies
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s): BarItem => ({ kind: "strategy", key: `s-${s.id}`, position: s.position, strategy: s })),
  ].sort((a, b) => a.position - b.position);

  function strategiesInFolder(folderId: number) {
    return strategies.filter((s) => s.folder_id === folderId).sort((a, b) => a.position - b.position);
  }

  const openFolderStrategies = openFolder != null ? strategiesInFolder(openFolder) : [];

  function handleBarDragStart(data: DragData, e: React.DragEvent) {
    dragDataRef.current = data;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify(data));
    // small delay so the element renders before drag image is captured
    (e.target as HTMLElement).style.opacity = "0.5";
  }

  function handleBarDragEnd(e: React.DragEvent) {
    (e.target as HTMLElement).style.opacity = "";
    setDropTarget(null);
    setDropOnFolder(null);
    dragDataRef.current = null;
  }

  function handleBarDragOver(e: React.DragEvent, index: number, itemKind: string, folderId?: number) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    const dragged = dragDataRef.current;
    if (!dragged) return;

    // If dragging a strategy over a folder, highlight the folder for "drop into"
    if (dragged.kind === "strategy" && itemKind === "folder" && folderId != null) {
      setDropOnFolder(folderId);
      setDropTarget(null);
      return;
    }

    // Calculate left/right drop position
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const side = e.clientX < midX ? "left" : "right";
    setDropTarget({ index, side });
    setDropOnFolder(null);
  }

  function handleBarDrop(e: React.DragEvent, index: number, itemKind: string, folderId?: number) {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    setDropOnFolder(null);

    const dragged = dragDataRef.current;
    dragDataRef.current = null;
    if (!dragged) return;

    // Strategy dropped onto a folder -> move into folder
    if (dragged.kind === "strategy" && itemKind === "folder" && folderId != null) {
      const nextPos = strategiesInFolder(folderId).length;
      onMoveStrategy(dragged.id, folderId, nextPos);
      return;
    }

    // Reorder within the bar
    const draggedKey =
      dragged.kind === "folder" ? `f-${dragged.id}` : `s-${dragged.id}`;
    const filtered = barItems.filter((it) => it.key !== draggedKey);
    const draggedItem = barItems.find((it) => it.key === draggedKey);
    if (!draggedItem) return;

    // Find the target's position in the filtered array
    const targetItem = barItems[index];
    let insertIdx = filtered.findIndex((it) => it.key === targetItem?.key);
    if (insertIdx === -1) insertIdx = filtered.length;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    if (e.clientX >= midX) insertIdx++;

    filtered.splice(insertIdx, 0, draggedItem);

    onReorder(
      filtered.map((it, idx) => ({
        type: it.kind,
        id: it.kind === "folder" ? it.folder.id : Number(it.strategy.id),
        position: idx,
      }))
    );
  }

  const chipBase =
    "group flex shrink-0 cursor-grab items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors select-none";

  return (
    <div className="flex h-full flex-col">
      {/* Horizontal bar */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-2 py-1.5 pb-1 [scrollbar-width:thin]">
        {barItems.map((item, idx) => {
          if (item.kind === "folder") {
            const f = item.folder;
            const count = strategiesInFolder(f.id).length;
            const isOpen = openFolder === f.id;
            const isDropTarget = dropOnFolder === f.id;
            const showLeftLine = dropTarget?.index === idx && dropTarget.side === "left";
            const showRightLine = dropTarget?.index === idx && dropTarget.side === "right";

            return (
              <div key={item.key} className="relative shrink-0 flex items-center">
                {showLeftLine && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-500 rounded-full -translate-x-1" />}
                <div
                  draggable
                  onDragStart={(e) => handleBarDragStart({ kind: "folder", id: f.id }, e)}
                  onDragEnd={handleBarDragEnd}
                  onDragOver={(e) => handleBarDragOver(e, idx, "folder", f.id)}
                  onDragLeave={() => { setDropOnFolder(null); setDropTarget(null); }}
                  onDrop={(e) => handleBarDrop(e, idx, "folder", f.id)}
                  onClick={() => setOpenFolder(isOpen ? null : f.id)}
                  className={cn(
                    chipBase,
                    isOpen
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-300"
                      : isDropTarget
                        ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/50"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  )}
                  title={f.name}
                >
                  <GripVertical size={10} className="shrink-0 text-slate-300 dark:text-slate-600" />
                  <Folder size={12} className="shrink-0 text-amber-500" />
                  <span className="max-w-[100px] truncate">{f.name}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-slate-100 px-1 text-[9px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {count}
                    </span>
                  )}
                  <ChevronDown size={10} className={cn("shrink-0 transition-transform", isOpen && "rotate-180")} />
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: "folder", id: f.id }); }}
                    className="ml-0.5 shrink-0 rounded p-0.5 opacity-0 hover:bg-red-100 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-950"
                    title="Delete folder"
                  >
                    <X size={11} />
                  </button>
                </div>
                {showRightLine && <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-indigo-500 rounded-full translate-x-1" />}
              </div>
            );
          }

          // Strategy chip
          const s = item.strategy;
          const showLeftLine = dropTarget?.index === idx && dropTarget.side === "left";
          const showRightLine = dropTarget?.index === idx && dropTarget.side === "right";

          return (
            <div key={item.key} className="relative shrink-0 flex items-center">
              {showLeftLine && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-500 rounded-full -translate-x-1" />}
              <div
                draggable
                onDragStart={(e) => handleBarDragStart({ kind: "strategy", id: s.id }, e)}
                onDragEnd={handleBarDragEnd}
                onDragOver={(e) => handleBarDragOver(e, idx, "strategy")}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => handleBarDrop(e, idx, "strategy")}
                onClick={() => onSelect(s.id)}
                className={cn(
                  chipBase,
                  selectedId === s.id
                    ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-300"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                )}
                title={s.name}
              >
                <GripVertical size={10} className="shrink-0 text-slate-300 dark:text-slate-600" />
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", typeDotColor(s.strategy_type))} />
                <FileCode size={12} className="shrink-0" />
                <span className="max-w-[110px] truncate">{s.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: "strategy", id: s.id }); }}
                  className="ml-0.5 shrink-0 rounded p-0.5 opacity-0 hover:bg-red-100 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-950"
                  title="Delete strategy"
                >
                  <X size={11} />
                </button>
              </div>
              {showRightLine && <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-indigo-500 rounded-full translate-x-1" />}
            </div>
          );
        })}

        {addingFolder ? (
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onBlur={() => { if (newFolderName.trim()) onCreateFolder(newFolderName.trim()); setAddingFolder(false); setNewFolderName(""); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newFolderName.trim()) { onCreateFolder(newFolderName.trim()); setAddingFolder(false); setNewFolderName(""); }
              if (e.key === "Escape") { setAddingFolder(false); setNewFolderName(""); }
            }}
            placeholder="Folder name..."
            className="w-28 shrink-0 rounded-md border border-indigo-400 bg-white px-2 py-1.5 text-xs outline-none dark:border-indigo-500 dark:bg-slate-900 dark:text-slate-200"
          />
        ) : (
          <button
            onClick={() => setAddingFolder(true)}
            className="flex shrink-0 items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-1.5 text-[11px] font-medium text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
            title="New folder"
          >
            <FolderPlus size={12} />
          </button>
        )}
      </div>

      {/* Inline folder contents below the bar */}
      {openFolder != null && (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-200 dark:border-slate-800">
          {openFolderStrategies.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-400">
              Empty folder. Drag a strategy here.
            </div>
          ) : (
            <ul className="p-1.5 space-y-0.5">
              {openFolderStrategies.map((s) => {
                const badge = typeBadge(s.strategy_type);
                return (
                  <li key={s.id}>
                    <div
                      onClick={() => onSelect(s.id)}
                      className={cn(
                        "group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm cursor-pointer transition-colors",
                        selectedId === s.id
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      )}
                    >
                      <FileCode size={14} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{s.name}</span>
                          <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold", badge.cls)}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          v{s.version}{s.version_count > 1 ? ` (${s.version_count} versions)` : ""} · {s.updated_at}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); onMoveStrategy(s.id, null, rootStrategies.length); }}
                        className="shrink-0 rounded p-1 text-slate-300 opacity-0 hover:bg-slate-200 group-hover:opacity-100 dark:text-slate-600 dark:hover:bg-slate-700"
                        title="Move out of folder"
                      >
                        <Folder size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: "strategy", id: s.id }); }}
                        className="shrink-0 rounded p-1 text-slate-300 opacity-0 hover:bg-red-100 hover:text-red-600 group-hover:opacity-100 dark:text-slate-600 dark:hover:bg-red-950"
                        title="Delete strategy"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmDelete(null)}>
          <div
            className="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Delete {confirmDelete.type === "folder" ? "Folder" : "Strategy"}?
            </h3>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {confirmDelete.type === "folder"
                ? "This will delete the folder and all strategies inside it. This action cannot be undone."
                : "This strategy will be permanently deleted. This action cannot be undone."}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmDelete.type === "strategy") onDelete(confirmDelete.id);
                  else onDeleteFolder(confirmDelete.id);
                  setConfirmDelete(null);
                }}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
