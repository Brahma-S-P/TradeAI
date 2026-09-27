import { useState, useEffect } from "react";
import { X, Eye, EyeOff, Shield, Key, Trash2, Lock, AlertTriangle, Lightbulb } from "lucide-react";
import { apiFetch, apiPost } from "@/lib/api";
import { cn } from "@/lib/cn";

interface CredentialsModalProps {
  open: boolean;
  onClose: () => void;
}

interface CredentialStatus {
  keys: string[];
  has_credentials: boolean;
  password_hint: string;
}

const CREDENTIAL_FIELDS = [
  { key: "zerodha_api_key", label: "Zerodha API Key", placeholder: "Your Kite Connect API key", group: "broker" },
  { key: "zerodha_api_secret", label: "Zerodha API Secret", placeholder: "Your Kite Connect API secret", group: "broker" },
  { key: "openai_api_key", label: "OpenAI API Key", placeholder: "sk-...", group: "llm" },
  { key: "anthropic_api_key", label: "Anthropic API Key", placeholder: "sk-ant-...", group: "llm" },
  { key: "deepseek_api_key", label: "DeepSeek API Key", placeholder: "sk-...", group: "llm" },
] as const;

export function CredentialsModal({ open, onClose }: CredentialsModalProps) {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [mode, setMode] = useState<"locked" | "unlocked" | "new">("locked");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hint, setHint] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (open) {
      fetchStatus();
      setPassword("");
      setConfirmPassword("");
      setHint("");
      setShowHint(false);
      setError("");
      setSuccess("");
      setValues({});
      setVisible({});
    }
  }, [open]);

  async function fetchStatus() {
    try {
      const data = await apiFetch<CredentialStatus>("/credentials");
      setStatus(data);
      if (data?.has_credentials) {
        setMode("locked");
        if (data.password_hint) setHint(data.password_hint);
      } else {
        setMode("new");
      }
    } catch {
      setMode("new");
    }
  }

  async function handleUnlock() {
    if (!password || !confirmPassword) {
      setError("Enter password in both fields");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await apiPost<{ credentials: Record<string, string> }>("/credentials/unlock", { password });
      setValues(res.credentials);
      await syncLlmKeys(res.credentials);
      setMode("unlocked");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes("403") ? "Wrong password" : "Failed to unlock");
    } finally {
      setLoading(false);
    }
  }

  async function syncLlmKeys(creds: Record<string, string>) {
    const keyMap: { key: string; provider: string }[] = [
      { key: "openai_api_key", provider: "openai" },
      { key: "anthropic_api_key", provider: "anthropic" },
      { key: "deepseek_api_key", provider: "deepseek" },
    ];
    for (const { key, provider } of keyMap) {
      if (creds[key]?.trim()) {
        try {
          await apiPost("/chat/set-provider", { provider, api_key: creds[key].trim() });
        } catch {}
        return;
      }
    }
  }

  async function handleSave() {
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    const hasAny = Object.values(values).some((v) => v.trim());
    if (!hasAny) {
      setError("Enter at least one credential");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await apiPost("/credentials/save", { password, credentials: values, password_hint: hint });
      await syncLlmKeys(values);
      setSuccess("Credentials saved securely");
      setTimeout(() => setSuccess(""), 3000);
      fetchStatus();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes("400") ? "Password must be at least 6 characters" : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAll() {
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      await apiPost("/credentials/delete-all", { password });
      setValues({});
      setMode("new");
      setPassword("");
      setConfirmPassword("");
      setHint("");
      setSuccess("All credentials deleted");
      fetchStatus();
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes("403") ? "Wrong password" : "Failed to delete");
    } finally {
      setLoading(false);
    }
  }

  function toggleVisible(key: string) {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (!open) return null;

  // ── Compact lock screen ──
  if (mode === "locked") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
        <div
          className="w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950/50">
                <Lock size={14} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Unlock Credentials</h2>
            </div>
            <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X size={14} />
            </button>
          </div>

          <div className="px-4 py-4">
            {/* Status badges */}
            {status && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {CREDENTIAL_FIELDS.map((f) => (
                  <span
                    key={f.key}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      status.keys.includes(f.key)
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                        : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                    )}
                  >
                    <Key size={9} />
                    {f.label}
                    {status.keys.includes(f.key) ? " ✓" : ""}
                  </span>
                ))}
              </div>
            )}

            {error && (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                <AlertTriangle size={13} />
                {error}
              </div>
            )}

            {/* Password fields */}
            <div className="space-y-2">
              <div className="relative">
                <input
                  type={visible["password"] ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-10 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                />
                <button
                  onClick={() => toggleVisible("password")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {visible["password"] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <input
                type={visible["password"] ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                placeholder="Confirm password"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>

            {/* Show Hint toggle */}
            {hint && (
              <div className="mt-3">
                {showHint ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
                    <Lightbulb size={13} className="mt-0.5 shrink-0 text-amber-500" />
                    <div>
                      <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">Hint: </span>
                      <span className="text-xs text-amber-700 dark:text-amber-300">{hint}</span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowHint(true)}
                    className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                  >
                    <Lightbulb size={12} />
                    Show password hint
                  </button>
                )}
              </div>
            )}

            {/* Unlock button */}
            <button
              onClick={handleUnlock}
              disabled={loading || !password || !confirmPassword}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Lock size={14} />
              {loading ? "Unlocking..." : "Unlock"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Full modal (new setup or unlocked editing) ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950/50">
              <Shield size={16} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {mode === "new" ? "Setup API Credentials" : "API Credentials"}
              </h2>
              <p className="text-[11px] text-slate-400">Encrypted with AES-256-GCM</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {/* Status badges */}
          {status && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {CREDENTIAL_FIELDS.map((f) => (
                <span
                  key={f.key}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    status.keys.includes(f.key)
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                      : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                  )}
                >
                  <Key size={9} />
                  {f.label}
                  {status.keys.includes(f.key) ? " ✓" : ""}
                </span>
              ))}
            </div>
          )}

          {error && (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
              <AlertTriangle size={13} />
              {error}
            </div>
          )}

          {success && (
            <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
              {success}
            </div>
          )}

          {/* Password section */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              {mode === "new" ? "Create Encryption Password" : "Encryption Password"}
            </label>
            <div className="relative">
              <input
                type={visible["password"] ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "new" ? "Create a strong password (min 6 chars)" : "Enter your password"}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-10 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
              <button
                onClick={() => toggleVisible("password")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {visible["password"] ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <div className="mt-2">
              <input
                type={visible["password"] ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>

            {/* Password hint — editable */}
            <div className="mt-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Lightbulb size={11} className="text-amber-500" />
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Password Hint (visible without unlocking)
                </label>
              </div>
              <input
                type="text"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="e.g. First pet's name + birth year"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>

            {mode === "new" && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                <Lock size={11} className="mt-0.5 shrink-0" />
                This password encrypts your API keys locally. It is never stored — if you forget it, you'll need to re-enter your credentials.
              </p>
            )}
          </div>

          {/* Credential fields grouped */}
          <div className="space-y-3">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Broker Keys</div>
            {CREDENTIAL_FIELDS.filter((f) => f.group === "broker").map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {field.label}
                </label>
                <div className="relative">
                  <input
                    type={visible[field.key] ? "text" : "password"}
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  />
                  <button
                    onClick={() => toggleVisible(field.key)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {visible[field.key] ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              LLM Keys <span className="font-normal text-slate-400">(paste any one — it auto-selects the provider)</span>
            </div>
            {CREDENTIAL_FIELDS.filter((f) => f.group === "llm").map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {field.label}
                </label>
                <div className="relative">
                  <input
                    type={visible[field.key] ? "text" : "password"}
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  />
                  <button
                    onClick={() => toggleVisible(field.key)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {visible[field.key] ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              For Ollama (local), leave these blank — configure the URL in the AI chat settings.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <div>
            {mode === "unlocked" && (
              <button
                onClick={handleDeleteAll}
                disabled={loading}
                className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50"
              >
                <Trash2 size={12} />
                Delete All
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Shield size={13} />
              {loading ? "Saving..." : "Save Encrypted"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
