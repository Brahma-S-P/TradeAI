import { useEffect, useRef, useState, useCallback } from "react";
import { apiFetch } from "./api";

interface PingResult {
  ok: boolean;
  reason?: string;
  user_id?: string;
  user_name?: string;
  cached?: boolean;
}

export interface KiteHeartbeatState {
  connected: boolean;
  wasConnected: boolean;
  lostConnection: boolean;
  userName: string | null;
  lastCheck: number;
  loginUrl: string | null;
  reconnect: () => void;
}

const POLL_INTERVAL = 15_000;

export function useKiteHeartbeat(): KiteHeartbeatState {
  const [connected, setConnected] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [lostConnection, setLostConnection] = useState(false);
  const wasConnectedRef = useRef(false);
  const [lastCheck, setLastCheck] = useState(0);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ login_url: string }>("/kite/login")
      .then((d) => setLoginUrl(d.login_url))
      .catch(() => {});
  }, []);

  const check = useCallback(async () => {
    try {
      const data = await apiFetch<PingResult>("/kite/ping");
      const isOk = data.ok === true;
      setConnected(isOk);
      setLastCheck(Date.now());
      if (isOk) {
        setUserName(data.user_name || data.user_id || null);
        if (!wasConnectedRef.current) {
          setLostConnection(false);
        }
        wasConnectedRef.current = true;
      } else {
        setUserName(null);
        if (wasConnectedRef.current) {
          setLostConnection(true);
          window.dispatchEvent(
            new CustomEvent("kite-disconnected", { detail: { reason: data.reason } })
          );
        }
        wasConnectedRef.current = false;
      }
    } catch {
      // Backend unreachable — don't flag as Kite disconnect
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [check]);

  useEffect(() => {
    function onConnect(e: MessageEvent) {
      if (e.data?.type === "kite-connected") {
        wasConnectedRef.current = true;
        setConnected(true);
        setLostConnection(false);
        check();
      }
    }
    window.addEventListener("message", onConnect);
    return () => window.removeEventListener("message", onConnect);
  }, [check]);

  const reconnect = useCallback(() => {
    if (loginUrl) {
      window.open(loginUrl, "_blank", "width=600,height=700");
    }
  }, [loginUrl]);

  return {
    connected,
    wasConnected: wasConnectedRef.current,
    lostConnection,
    userName,
    lastCheck,
    loginUrl,
    reconnect,
  };
}
