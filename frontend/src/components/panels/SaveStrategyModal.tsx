import { useEffect, useState } from "react";
import { Folder, FolderPlus, Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface FolderOption {
  id: number;
  name: string;
}

export type FolderChoice = { folderId: number } | { newFolderName: string };

interface SaveStrategyModalProps {
  open: boolean;
  strategyType: string | null;
  folders: FolderOption[];
  onClose: () => void;
  onSave: (name: string, folder: FolderChoice) => void;
}

export function SaveStrategyModal({ open, strategyType, folders, onClose, onSave }: SaveStrategyModalProps) {
  const [name, setName] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setSelectedFolderId(null);
      setCreatingNew(folders.length === 0);
      setNewFolderName("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const folderChosen = creatingNew ? newFolderName.trim().length > 0 : selectedFolderId !== null;
  const canSave = name.trim().length > 0 && folderChosen;

  function handleSave() {
    if (!canSave) return;
    const folder: FolderChoice = creatingNew ? { newFolderName: newFolderName.trim() } : { folderId: selectedFolderId! };
    onSave(name.trim(), folder);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Save {strategyType === "manual" ? "Filter" : "Code"} Strategy
        </h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Strategy name..."
          className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        />

        <div className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">Save into folder</div>
        <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => { setSelectedFolderId(f.id); setCreatingNew(false); }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm",
                !creatingNew && selectedFolderId === f.id
                  ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-300"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
            >
              <Folder size={13} className="shrink-0 text-amber-500" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              {!creatingNew && selectedFolderId === f.id && <Check size={13} className="shrink-0" />}
            </button>
          ))}

          {creatingNew ? (
            <div className="flex items-center gap-2 rounded-md border border-indigo-400 px-2.5 py-1.5 dark:border-indigo-500">
              <FolderPlus size={13} className="shrink-0 text-indigo-500" />
              <input
                autoFocus={folders.length === 0}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="New folder name..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none dark:text-slate-200"
              />
            </div>
          ) : (
            <button
              onClick={() => { setCreatingNew(true); setSelectedFolderId(null); }}
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-slate-300 px-2.5 py-1.5 text-left text-sm text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
            >
              <FolderPlus size={13} className="shrink-0" />
              New folder...
            </button>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
