import { useEffect, useState } from "react";
import { Save, FolderOpen, Trash2, Plus } from "lucide-react";
import { apiFetch, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";

interface SessionData {
  id: number;
  name: string;
  symbol: string | null;
  strategy_id: string | null;
  notes: string;
  indicator_state: string[];
  code: string;
  builder_mode: string;
  conditions: Record<string, unknown>;
  selected_symbols: string[];
  created_at: string | null;
  updated_at: string | null;
}

interface SessionManagerProps {
  currentState: {
    symbol: string | null;
    notes: string;
    indicators: string[];
    code: string;
    builderMode: string;
    conditions: Record<string, unknown>;
    selectedSymbols: string[];
  };
  onLoad: (session: SessionData) => void;
}

export function SessionManager({ currentState, onLoad }: SessionManagerProps) {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [open, setOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      apiFetch<SessionData[]>("/sessions")
        .then(setSessions)
        .catch(() => setSessions([]));
    }
  }, [open]);

  async function handleSave() {
    const name = saveName.trim() || `Session ${new Date().toLocaleString()}`;
    const payload = {
      name,
      symbol: currentState.symbol,
      notes: currentState.notes,
      indicator_state: currentState.indicators,
      code: currentState.code,
      builder_mode: currentState.builderMode,
      conditions: currentState.conditions,
      selected_symbols: currentState.selectedSymbols,
    };

    if (activeSessionId) {
      await apiFetch(`/sessions/${activeSessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      const created = await apiPost<SessionData>("/sessions", payload);
      setActiveSessionId(created.id);
    }

    setSaveName("");
    apiFetch<SessionData[]>("/sessions")
      .then(setSessions)
      .catch(() => setSessions([]));
  }

  function handleLoad(session: SessionData) {
    setActiveSessionId(session.id);
    onLoad(session);
    setOpen(false);
  }

  async function handleDelete(id: number) {
    await apiFetch(`/sessions/${id}`, { method: "DELETE" });
    if (activeSessionId === id) setActiveSessionId(null);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <FolderOpen size={11} />
          {activeSessionId ? `Session #${activeSessionId}` : "Sessions"}
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400"
        >
          <Save size={11} />
          Save
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-8 z-50 w-64 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-200 p-2 dark:border-slate-700">
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Session name..."
                className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
              <button
                onClick={() => { setActiveSessionId(null); handleSave(); }}
                className="flex items-center gap-0.5 rounded bg-indigo-600 px-2 py-1 text-[10px] text-white hover:bg-indigo-700"
              >
                <Plus size={10} /> New
              </button>
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {sessions.length === 0 ? (
              <div className="py-4 text-center text-[10px] text-slate-400">No saved sessions</div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "group flex items-center justify-between rounded px-2 py-1.5 transition-colors",
                    activeSessionId === s.id
                      ? "bg-indigo-50 dark:bg-indigo-950/30"
                      : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  )}
                >
                  <button
                    onClick={() => handleLoad(s)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
                      {s.name}
                    </div>
                    <div className="text-[9px] text-slate-400">
                      {s.symbol || "—"} · {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : ""}
                    </div>
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="hidden shrink-0 rounded p-0.5 text-slate-400 hover:text-red-500 group-hover:block"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
