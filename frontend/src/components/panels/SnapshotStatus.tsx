import { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCw, Database, AlertCircle, DownloadCloud } from "lucide-react";
import { apiFetch, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";

interface SnapshotStatusData {
  has_today: boolean;
  running: boolean;
  kite_connected: boolean;
  history_loaded: boolean;
  stored_symbols: number;
  last_run: {
    date: string;
    status: string;
    source: string;
    universe: string;
    processed: number;
    total: number;
    finished_at: string | null;
  } | null;
}

export function SnapshotStatus({ index, compact = false }: { index: string; compact?: boolean }) {
  const [data, setData] = useState<SnapshotStatusData | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoDone = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const d = await apiFetch<SnapshotStatusData>("/snapshot/status");
      setData(d);
      return d;
    } catch {
      return null;
    }
  }, []);

  const post = useCallback(async (path: string, body?: unknown) => {
    try {
      await apiPost(path, body ?? {});
      setData((d) => (d ? { ...d, running: true } : d));
    } catch {
      /* ignore */
    }
  }, []);

  const loadHistory = useCallback(() => post("/snapshot/run", { index: "NIFTY500" }), [post]);
  const topup = useCallback(() => post("/snapshot/topup"), [post]);

  // Poll while running.
  useEffect(() => {
    if (data?.running && !pollRef.current) {
      pollRef.current = setInterval(fetchStatus, 2000);
    } else if (!data?.running && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [data?.running, fetchStatus]);

  // On first mount: auto-pull data if needed.
  // - No history at all → kick off full history pull (first-time setup)
  // - History exists but today's snapshot missing → fast daily top-up
  useEffect(() => {
    (async () => {
      const d = await fetchStatus();
      if (!d || d.running || autoDone.current) return;
      autoDone.current = true;
      if (!d.history_loaded) {
        loadHistory();
      } else if (!d.has_today) {
        topup();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh status when Kite connects (login popup sends postMessage).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "kite-connected") fetchStatus();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [fetchStatus]);

  if (!data) return null;

  const running = data.running;
  const run = data.last_run;
  const source = run?.source;
  const pct = run && run.total ? Math.round((run.processed / run.total) * 100) : 0;
  const runLabel =
    run?.universe === "FULL_NSE" ? "full history"
    : run?.universe === "TOPUP" ? "daily top-up"
    : run?.universe ?? "";

  const content = (
    <>
      <Database size={compact ? 10 : 12} className="shrink-0 text-slate-400" />

      {running ? (
        <span className="flex items-center gap-2 font-medium text-indigo-600 dark:text-indigo-400">
          <RefreshCw size={11} className="animate-spin" />
          {runLabel === "full history" ? "Loading history" : "Refreshing"}…
          {run ? ` ${run.processed}/${run.total}` : ""}
          {run && run.total > 0 && (
            <span className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-950">
              <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
            </span>
          )}
        </span>
      ) : (
        <span className="text-slate-500 dark:text-slate-400">
          {run ? (
            <>
              {!compact && "Data: "}<span className="font-medium text-slate-700 dark:text-slate-200">{run.date}</span>
              <span
                className={cn(
                  "ml-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase",
                  source === "kite"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                )}
              >
                {source === "kite" ? "live" : "historical"}
              </span>
              <span className="ml-1 text-slate-400">· {run.processed}</span>
            </>
          ) : (
            "No data"
          )}
        </span>
      )}

      {!compact && !data.kite_connected && (
        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400" title="Reconnect Kite for live market data">
          <AlertCircle size={11} />
          Connect Kite for live data
        </span>
      )}

      <div className={compact ? "flex items-center" : "ml-auto flex items-center gap-1.5"}>
        {!data.history_loaded ? (
          <button
            onClick={loadHistory}
            disabled={running}
            className={compact
              ? "rounded p-0.5 text-indigo-500 hover:bg-indigo-50 disabled:opacity-50 dark:hover:bg-indigo-950"
              : "flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            }
            title="Load full history"
          >
            <DownloadCloud size={compact ? 10 : 11} />
            {!compact && " Load Full History"}
          </button>
        ) : (
          <button
            onClick={topup}
            disabled={running}
            className={compact
              ? "rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800"
              : "flex items-center gap-1 rounded-md border border-slate-300 px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            }
            title="Append today's candle for the whole universe (fast)"
          >
            <RefreshCw size={compact ? 10 : 11} className={running ? "animate-spin" : ""} />
            {!compact && " Refresh"}
          </button>
        )}
      </div>
    </>
  );

  if (compact) {
    return <div className="flex items-center gap-1.5 text-[10px]">{content}</div>;
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] dark:border-slate-800 dark:bg-slate-900/50">
      {content}
    </div>
  );
}
