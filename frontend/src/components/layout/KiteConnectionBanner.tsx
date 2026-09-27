import { useState, useEffect } from "react";
import { AlertTriangle, LogIn, X, RefreshCw } from "lucide-react";

interface KiteConnectionBannerProps {
  lostConnection: boolean;
  connected: boolean;
  loginUrl: string | null;
  onReconnect: () => void;
}

export function KiteConnectionBanner({ lostConnection, connected, loginUrl, onReconnect }: KiteConnectionBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (lostConnection) {
      setDismissed(false);
      setShowReconnected(false);
    }
  }, [lostConnection]);

  useEffect(() => {
    if (connected && !dismissed && lostConnection === false) {
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [connected, dismissed, lostConnection]);

  if (showReconnected) {
    return (
      <div className="flex items-center justify-center gap-2 bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white animate-in slide-in-from-top">
        <RefreshCw size={12} />
        Kite reconnected successfully
      </div>
    );
  }

  if (!lostConnection || dismissed || connected) return null;

  return (
    <div className="flex items-center justify-between bg-red-600 px-4 py-2 text-white animate-in slide-in-from-top">
      <div className="flex items-center gap-2.5">
        <AlertTriangle size={16} className="shrink-0 animate-pulse" />
        <div>
          <span className="text-sm font-semibold">Zerodha Kite Disconnected</span>
          <span className="ml-2 text-xs opacity-80">
            Session expired or network lost. Live data and trading are unavailable.
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => loginUrl && window.open(loginUrl, "_blank", "width=600,height=700")}
          disabled={!loginUrl}
          className="flex items-center gap-1.5 rounded-md bg-white/20 px-3 py-1 text-xs font-semibold text-white hover:bg-white/30 transition-colors disabled:opacity-50"
        >
          <LogIn size={12} />
          Reconnect
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="rounded p-1 hover:bg-white/20 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
