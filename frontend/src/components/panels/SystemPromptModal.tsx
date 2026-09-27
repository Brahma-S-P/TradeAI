import { useState, useEffect } from "react";
import { X, Plus, Trash2, Check, Edit3, Star } from "lucide-react";
import { apiFetch, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";

interface SystemPrompt {
  id: number;
  name: string;
  content: string;
  context: string;
  is_default: boolean;
}

interface SystemPromptModalProps {
  open: boolean;
  onClose: () => void;
  context: string;
  selectedPromptId: number | null;
  onSelect: (prompt: SystemPrompt | null) => void;
}

export function SystemPromptModal({
  open,
  onClose,
  context,
  selectedPromptId,
  onSelect,
}: SystemPromptModalProps) {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    if (open) fetchPrompts();
  }, [open, context]);

  async function fetchPrompts() {
    try {
      const data = await apiFetch<SystemPrompt[]>(`/system-prompts?context=${context}`);
      setPrompts(Array.isArray(data) ? data : []);
    } catch {
      setPrompts([]);
    }
  }

  function startNew() {
    setEditingId("new");
    setEditName("");
    setEditContent("");
  }

  function startEdit(p: SystemPrompt) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditContent(p.content);
  }

  async function handleSave() {
    if (!editName.trim() || !editContent.trim()) return;
    if (editingId === "new") {
      await apiPost("/system-prompts", { name: editName, content: editContent, context });
    } else if (editingId !== null) {
      await apiFetch(`/system-prompts/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, content: editContent }),
      });
    }
    setEditingId(null);
    fetchPrompts();
  }

  async function handleDelete(id: number) {
    await apiFetch(`/system-prompts/${id}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    if (selectedPromptId === id) onSelect(null);
    fetchPrompts();
  }

  async function handleSetDefault(p: SystemPrompt) {
    await apiFetch(`/system-prompts/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_default: !p.is_default }),
    });
    fetchPrompts();
  }

  function handleSelect(p: SystemPrompt) {
    onSelect(selectedPromptId === p.id ? null : p);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">System Prompts</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={startNew}
              className="flex items-center gap-1 rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-400"
            >
              <Plus size={12} />
              New
            </button>
            <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {editingId !== null && (
            <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-800 dark:bg-indigo-950/30">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Prompt name..."
                className="mb-2 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                autoFocus
              />
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="System prompt content..."
                rows={6}
                className="w-full resize-none rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={() => setEditingId(null)}
                  className="rounded-md px-3 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!editName.trim() || !editContent.trim()}
                  className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {editingId === "new" ? "Create" : "Save"}
                </button>
              </div>
            </div>
          )}

          {prompts.length === 0 && editingId === null && (
            <p className="py-8 text-center text-sm text-slate-400">
              No system prompts yet. Create one to customize AI behavior.
            </p>
          )}

          <div className="space-y-2">
            {prompts.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "group rounded-lg border p-3 transition-colors",
                  selectedPromptId === p.id
                    ? "border-indigo-400 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-950/40"
                    : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                )}
              >
                <div className="flex items-start justify-between">
                  <button
                    onClick={() => handleSelect(p)}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{p.name}</span>
                      {p.is_default && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                          DEFAULT
                        </span>
                      )}
                      {selectedPromptId === p.id && (
                        <Check size={14} className="text-indigo-500" />
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                      {p.content}
                    </p>
                  </button>
                  <div className="ml-2 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => handleSetDefault(p)}
                      className={cn(
                        "rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800",
                        p.is_default ? "text-amber-500" : "text-slate-400"
                      )}
                      title={p.is_default ? "Remove default" : "Set as default"}
                    >
                      <Star size={13} fill={p.is_default ? "currentColor" : "none"} />
                    </button>
                    <button
                      onClick={() => startEdit(p)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                      title="Edit"
                    >
                      <Edit3 size={13} />
                    </button>
                    {confirmDeleteId === p.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-red-700"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(p.id)}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
