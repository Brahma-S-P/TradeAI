import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal, Trash2, Pause, Play } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";

interface LogEvent {
  id: number;
  ts: number;
  level: string; // info | success | warn | error
  source: string;
  message: string;
}

const LEVEL_COLOR: Record<string, string> = {
  success: "text-emerald-500 dark:text-emerald-400",
  warn: "text-amber-500 dark:text-amber-400",
  error: "text-red-500 dark:text-red-400",
  info: "text-slate-500 dark:text-slate-400",
};

const SOURCE_COLOR: Record<string, string> = {
  snapshot: "text-indigo-500 dark:text-indigo-400",
  picker: "text-purple-500 dark:text-purple-400",
  http: "text-sky-500 dark:text-sky-400",
};

function fmtTime(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

export function LogPanel() {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const lastId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  const poll = useCallback(async () => {
    try {
      const res = await apiFetch<{ events: LogEvent[]; last_id: number }>(
        `/logs?after=${lastId.current}`
      );
      if (res.events.length) {
        lastId.current = res.last_id;
        setEvents((prev) => {
          const next = [...prev, ...res.events];
          return next.length > 1000 ? next.slice(-1000) : next;
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (paused) return;
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, [paused, poll]);

  // Auto-scroll to bottom when new logs arrive, unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [events]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
  }

  async function clear() {
    try {
      await apiFetch("/logs", { method: "DELETE" });
    } catch { /* ignore */ }
    setEvents([]);
    lastId.current = 0;
  }

  return (
    <div className="flex h-full flex-col border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-1.5 dark:border-slate-800">
        <Terminal size={12} className="text-slate-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Activity Log
        </span>
        <span className="text-[10px] text-slate-400">{events.length}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setPaused((p) => !p)}
            className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800"
            title={paused ? "Resume" : "Pause"}
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
          </button>
          <button
            onClick={clear}
            className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950"
            title="Clear log"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5 font-mono text-[10.5px] leading-relaxed [scrollbar-width:thin]"
      >
        {events.length === 0 ? (
          <div className="py-4 text-center text-[11px] text-slate-400">
            No activity yet. Run a filter or refresh data to see logs.
          </div>
        ) : (
          events.map((e) => (
            <div key={e.id} className="flex gap-2 whitespace-pre-wrap break-words">
              <span className="shrink-0 text-slate-400">{fmtTime(e.ts)}</span>
              <span className={cn("shrink-0 font-semibold", SOURCE_COLOR[e.source] || "text-slate-400")}>
                {e.source}
              </span>
              <span className={cn("min-w-0", LEVEL_COLOR[e.level] || LEVEL_COLOR.info)}>
                {e.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
