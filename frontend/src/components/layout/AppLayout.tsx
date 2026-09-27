import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { KiteDisconnectedPopup } from "./KiteDisconnectedPopup";
import { KiteConnectionBanner } from "./KiteConnectionBanner";
import { useKiteHeartbeat } from "@/lib/useKiteHeartbeat";

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const heartbeat = useKiteHeartbeat();

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <KiteConnectionBanner
          lostConnection={heartbeat.lostConnection}
          connected={heartbeat.connected}
          loginUrl={heartbeat.loginUrl}
          onReconnect={heartbeat.reconnect}
        />
        <TopBar kiteConnected={heartbeat.connected} kiteUserName={heartbeat.userName} />
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <KiteDisconnectedPopup />
    </div>
  );
}
