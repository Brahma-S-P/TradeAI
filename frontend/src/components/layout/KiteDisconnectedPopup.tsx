import { useEffect, useState } from "react";
import { AlertTriangle, X, LogIn } from "lucide-react";
import { useApi } from "@/lib/useApi";

interface KiteStatus {
  connected: boolean;
}

interface KiteLogin {
  login_url: string;
}

export function KiteDisconnectedPopup() {
  const { data: kiteStatus, refetch } = useApi<KiteStatus>("/kite/status");
  const { data: kiteLogin } = useApi<KiteLogin>("/kite/login");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "kite-connected") refetch();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [refetch]);

  if (dismissed || !kiteStatus || kiteStatus.connected) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-md rounded-xl border border-amber-200 bg-white p-6 shadow-2xl dark:border-amber-800 dark:bg-slate-900">
        <button
          onClick={() => setDismissed(true)}
          className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <X size={16} />
        </button>
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
            <AlertTriangle size={24} className="text-amber-500" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-800 dark:text-slate-100">
            Zerodha Kite Not Connected
          </h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Using stored historical data for screening and backtesting. Connect Kite for live prices and real-time trading.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={() => kiteLogin?.login_url && window.open(kiteLogin.login_url, "_blank", "width=600,height=700")}
              disabled={!kiteLogin?.login_url}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-50"
            >
              <LogIn size={14} />
              Connect Now
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Continue with Historical Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
