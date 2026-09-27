import { useState, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, Settings, ShieldCheck, ShieldAlert } from "lucide-react";
import { navGroups } from "@/routes/nav-config";
import { cn } from "@/lib/cn";
import { apiFetch } from "@/lib/api";
import { CredentialsModal } from "@/components/panels/CredentialsModal";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [hasCredentials, setHasCredentials] = useState<boolean | null>(null);

  const checkCredentials = useCallback(async () => {
    try {
      const data = await apiFetch<{ has_credentials: boolean }>("/credentials");
      setHasCredentials(data?.has_credentials ?? false);
    } catch {
      setHasCredentials(false);
    }
  }, []);

  useEffect(() => {
    checkCredentials();
  }, [checkCredentials]);

  function handleCloseModal() {
    setCredentialsOpen(false);
    checkCredentials();
  }

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-slate-200 bg-slate-50 transition-[width] duration-150 dark:border-slate-800 dark:bg-slate-900",
        collapsed ? "w-14" : "w-56"
      )}
    >
      <div className="flex items-center justify-between px-3 py-3">
        {!collapsed && (
          <span className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
            Trading Console
          </span>
        )}
        <button
          onClick={onToggle}
          className="rounded p-1.5 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      {/* API Credentials button */}
      <div className="px-2 pb-2">
        <button
          onClick={() => setCredentialsOpen(true)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
            hasCredentials
              ? "text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
              : "text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
          )}
          title={collapsed ? (hasCredentials ? "API Keys Configured" : "API Keys Not Set") : undefined}
        >
          {hasCredentials ? (
            <ShieldCheck size={16} className="shrink-0" />
          ) : (
            <ShieldAlert size={16} className="shrink-0" />
          )}
          {!collapsed && (
            <span className="truncate">
              {hasCredentials ? "API Keys" : "Set API Keys"}
            </span>
          )}
          {!collapsed && hasCredentials === false && (
            <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
              !
            </span>
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <div className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {group.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {group.tabs.map((tab) => (
                <li key={tab.path}>
                  <NavLink
                    to={tab.path}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-indigo-600 text-white"
                          : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
                      )
                    }
                    title={collapsed ? tab.label : undefined}
                  >
                    <tab.icon size={16} className="shrink-0" />
                    {!collapsed && <span className="truncate">{tab.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <CredentialsModal open={credentialsOpen} onClose={handleCloseModal} />
    </aside>
  );
}
