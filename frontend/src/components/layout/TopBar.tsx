import { useEffect, useState, useCallback, useRef } from "react";
import { Circle, Sun, Moon, Monitor, Minus, Plus, LogIn, RefreshCw, CheckCircle, AlertCircle, Database, Wifi, WifiOff, X, BarChart3 } from "lucide-react";
import { NotificationBell } from "@/components/panels/NotificationBell";
import { SnapshotStatus } from "@/components/panels/SnapshotStatus";
import { HistoricalDataModal } from "./HistoricalDataModal";
import { apiFetch, apiPost } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSettings } from "@/lib/useSettings";
import { cn } from "@/lib/cn";

type MarketState = "open" | "pre" | "closed";

// NSE regular session: Mon–Fri, 09:15–15:30 IST (pre-open 09:00–09:15).
function getMarketStatus(): { label: string; state: MarketState; ist: string } {
  const now = new Date();
  // Convert to IST (UTC+5:30) regardless of the viewer's local timezone.
  const istMs = now.getTime() + now.getTimezoneOffset() * 60000 + 5.5 * 3600000;
  const ist = new Date(istMs);
  const day = ist.getDay(); // 0 Sun … 6 Sat
  const mins = ist.getHours() * 60 + ist.getMinutes();
  const hh = String(ist.getHours()).padStart(2, "0");
  const mm = String(ist.getMinutes()).padStart(2, "0");
  const clock = `${hh}:${mm} IST`;

  const weekday = day >= 1 && day <= 5;
  const preOpen = 9 * 60;      // 09:00
  const open = 9 * 60 + 15;    // 09:15
  const close = 15 * 60 + 30;  // 15:30

  if (!weekday) return { label: "Market Closed", state: "closed", ist: clock };
  if (mins >= open && mins < close) return { label: "Market Open", state: "open", ist: clock };
  if (mins >= preOpen && mins < open) return { label: "Pre-Open", state: "pre", ist: clock };
  return { label: "Market Closed", state: "closed", ist: clock };
}

interface PnLData {
  realized: number;
  unrealized: number;
  total: number;
}

const themeOptions = [
  { value: "light" as const, icon: Sun, label: "Light" },
  { value: "dark" as const, icon: Moon, label: "Dark" },
  { value: "system" as const, icon: Monitor, label: "System" },
];

interface SyncStatus {
  has_today: boolean;
  running: boolean;
  current_symbol: string;
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

interface Toast {
  id: number;
  type: "success" | "info" | "warning" | "error";
  title: string;
  message: string;
  dismissable?: boolean;
}

let _toastId = 0;

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="absolute right-0 top-full z-50 mt-2 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs shadow-lg animate-in slide-in-from-top-2 min-w-[280px] max-w-[360px]",
            t.type === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
            t.type === "info" && "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300",
            t.type === "warning" && "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
            t.type === "error" && "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
          )}
        >
          <div className="mt-0.5 shrink-0">
            {t.type === "success" && <CheckCircle size={14} />}
            {t.type === "info" && <Database size={14} />}
            {t.type === "warning" && <WifiOff size={14} />}
            {t.type === "error" && <AlertCircle size={14} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{t.title}</div>
            <div className="mt-0.5 text-[11px] opacity-80">{t.message}</div>
          </div>
          {t.dismissable !== false && (
            <button onClick={() => onDismiss(t.id)} className="shrink-0 rounded p-0.5 opacity-50 hover:opacity-100">
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function SyncDataButton() {
  const [pulling, setPulling] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0, symbol: "" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addToast = useCallback((type: Toast["type"], title: string, message: string, autoMs = 5000) => {
    const id = ++_toastId;
    setToasts((prev) => [...prev.slice(-2), { id, type, title, message }]);
    if (autoMs > 0) setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), autoMs);
    return id;
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const pollUntilDone = useCallback((source: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const d = await apiFetch<SyncStatus>("/snapshot/status");
        if (d.running && d.last_run) {
          setProgress({ processed: d.last_run.processed, total: d.last_run.total, symbol: d.current_symbol });
        } else if (!d.running) {
          stopPolling();
          setPulling(false);
          const run = d.last_run;
          if (run?.status === "done") {
            addToast("success", "Data Sync Complete",
              `${run.processed} stocks synced from ${source === "kite" ? "Zerodha Kite (live)" : "historical data"}. Indicators computed for all stocks.`);
          } else {
            addToast("error", "Sync Failed", "The data pull did not complete. Check the event log for details.");
          }
        }
      } catch { /* ignore */ }
    }, 1500);
  }, [addToast, stopPolling]);

  async function handleSync() {
    stopPolling();
    try {
      const status = await apiFetch<SyncStatus>("/snapshot/status");

      if (status.running) {
        setPulling(true);
        setProgress({ processed: status.last_run?.processed ?? 0, total: status.last_run?.total ?? 0, symbol: status.current_symbol });
        addToast("info", "Sync Already Running", `Currently processing ${status.current_symbol || "stocks"}...`);
        pollUntilDone(status.kite_connected ? "kite" : "mock");
        return;
      }

      if (!status.kite_connected) {
        addToast("warning", "Zerodha Not Connected",
          "Kite is not connected — using stored historical data. Connect Kite for live market data.", 6000);
      }

      if (status.has_today) {
        const run = status.last_run;
        const src = run?.source === "kite" ? "Zerodha (live)" : "historical data";
        addToast("info", "Already Up to Date",
          `Today's data is ready — ${run?.processed ?? 0} stocks from ${src}, last synced at ${run?.finished_at?.split(" ")[1]?.slice(0, 5) || "earlier"}.`);
        return;
      }

      // Start the pull
      setPulling(true);
      setProgress({ processed: 0, total: 0, symbol: "starting..." });
      const source = status.kite_connected ? "kite" : "mock";

      if (status.history_loaded) {
        await apiPost("/snapshot/topup", {});
        addToast("info", "Daily Refresh Started", "Appending today's candle and recomputing indicators for all stocks...", 8000);
      } else {
        await apiPost("/snapshot/history", {});
        addToast("info", "Initial Data Pull Started",
          `Pulling daily candles for all NSE equities (~4000+ stocks)${status.kite_connected ? " from Zerodha Kite" : " (historical mode)"}. This will take ~20-30 minutes...`, 15000);
      }
      pollUntilDone(source);
    } catch {
      setPulling(false);
      addToast("error", "Sync Failed", "Could not reach the backend server. Is it running?");
    }
  }

  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="relative flex items-center">
      <button
        onClick={handleSync}
        disabled={pulling}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
          pulling
            ? "border-indigo-300 bg-indigo-50 text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-400"
            : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        )}
        title="Pull latest market data"
      >
        <RefreshCw size={12} className={pulling ? "animate-spin" : ""} />
        {pulling ? (
          <span className="flex items-center gap-1.5">
            <span>{progress.symbol || "Starting"}</span>
            {progress.total > 0 && (
              <>
                <span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-900">
                  <span className="block h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
                </span>
                <span className="tabular-nums">{progress.processed}/{progress.total}</span>
              </>
            )}
          </span>
        ) : "Sync Data"}
      </button>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

interface TopBarProps {
  kiteConnected?: boolean;
  kiteUserName?: string | null;
}

export function TopBar({ kiteConnected = false, kiteUserName }: TopBarProps) {
  const { data: pnl } = useApi<PnLData>("/trading/pnl");
  const { data: kiteLogin } = useApi<{ login_url: string }>("/kite/login");
  const { theme, setTheme, fontSize, setFontSize, fontSizes } = useSettings();
  const total = pnl?.total ?? 0;
  const isPositive = total >= 0;

  const canDecrease = fontSize > fontSizes[0];
  const canIncrease = fontSize < fontSizes[fontSizes.length - 1];

  const isKiteConnected = kiteConnected;

  const [market, setMarket] = useState(getMarketStatus());
  useEffect(() => {
    const id = setInterval(() => setMarket(getMarketStatus()), 20000);
    return () => clearInterval(id);
  }, []);

  const marketDot =
    market.state === "open" ? "fill-emerald-500 text-emerald-500"
    : market.state === "pre" ? "fill-amber-500 text-amber-500"
    : "fill-slate-400 text-slate-400";
  const marketText =
    market.state === "open" ? "text-emerald-600 dark:text-emerald-400"
    : market.state === "pre" ? "text-amber-600 dark:text-amber-400"
    : "text-slate-500 dark:text-slate-400";

  const kiteLoginUrl = kiteLogin?.login_url;
  const [showHistorical, setShowHistorical] = useState(false);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-2 text-sm">
        <Circle size={8} className={cn(marketDot, market.state === "open" && "animate-pulse")} />
        <span className={cn("font-medium", marketText)}>{market.label}</span>
        <span className="text-xs text-slate-400">· {market.ist}</span>
        {!isKiteConnected && <span className="text-xs text-slate-400">· historical data</span>}
      </div>
      <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
        {isKiteConnected ? (
          <span className="flex items-center gap-1.5">
            <Circle size={6} className="fill-emerald-500 text-emerald-500" />
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              Kite: {kiteUserName || "Connected"}
            </span>
          </span>
        ) : (
          <button
            onClick={() => kiteLoginUrl && window.open(kiteLoginUrl, "_blank", "width=600,height=700")}
            disabled={!kiteLoginUrl}
            className="flex items-center gap-1.5 rounded-md border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-400 dark:hover:bg-indigo-900 disabled:opacity-50"
          >
            <LogIn size={12} />
            Connect Kite
          </button>
        )}
        <SyncDataButton />
        <button
          onClick={() => setShowHistorical(true)}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <BarChart3 size={12} />
          Historical Data
        </button>
        <HistoricalDataModal open={showHistorical} onClose={() => setShowHistorical(false)} />
        <span className={`font-medium ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          P&amp;L: {isPositive ? "+" : ""}₹{Math.abs(total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </span>

        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-800" />

        <SnapshotStatus index="NIFTY500" compact />

        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-800" />

        {/* Font size adjuster */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const idx = fontSizes.indexOf(fontSize);
              if (idx > 0) setFontSize(fontSizes[idx - 1]);
            }}
            disabled={!canDecrease}
            className="rounded p-1 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-900"
            title="Decrease font size"
          >
            <Minus size={14} />
          </button>
          <span className="w-8 text-center text-xs font-medium">{fontSize}px</span>
          <button
            onClick={() => {
              const idx = fontSizes.indexOf(fontSize);
              if (idx < fontSizes.length - 1) setFontSize(fontSizes[idx + 1]);
            }}
            disabled={!canIncrease}
            className="rounded p-1 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-900"
            title="Increase font size"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-800" />

        {/* Theme toggle */}
        <div className="flex items-center rounded-md border border-slate-200 dark:border-slate-800">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                theme === opt.value
                  ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400"
                  : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              )}
              title={opt.label}
            >
              <opt.icon size={14} />
            </button>
          ))}
        </div>

        <NotificationBell count={3} />
      </div>
    </header>
  );
}
