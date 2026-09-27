import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, Send, Loader2, PanelRightClose, PanelRightOpen, Paperclip, Bot, X, Wrench, ChevronDown, ChevronRight, Key, Server, Square, RefreshCw, Plus, MessageSquare, Trash2, Pencil, Check } from "lucide-react";
import { apiPost, apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { SystemPromptModal } from "./SystemPromptModal";
import { AttachStrategyModal, type StrategyAttachment } from "./AttachStrategyModal";

interface ToolCallInfo {
  tool: string;
  input: Record<string, unknown>;
  output_preview: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  code?: string;
  attachments?: StrategyAttachment[];
  toolCalls?: ToolCallInfo[];
}

interface ChatResponse {
  response: string;
  code: string | null;
  conditions: Record<string, unknown> | null;
  tool_calls: ToolCallInfo[];
}

interface ChatSession {
  id: string;
  name: string;
  messages: Message[];
  createdAt: number;
}

function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getSessionsKey(tab: string) {
  return `ai-chat-sessions-${tab}`;
}

function loadSessions(tab: string): ChatSession[] {
  try {
    const raw = localStorage.getItem(getSessionsKey(tab));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessions(tab: string, sessions: ChatSession[]) {
  try {
    localStorage.setItem(getSessionsKey(tab), JSON.stringify(sessions));
  } catch {}
}

function getActiveSessionKey(tab: string) {
  return `ai-chat-active-session-${tab}`;
}

interface SystemPrompt {
  id: number;
  name: string;
  content: string;
  context: string;
  is_default: boolean;
}

interface StoredStrategy {
  id: string;
  name: string;
  version: number;
  strategy_type: string;
  code: string;
}

interface ModelOption {
  id: string;
  name: string;
}

type ProviderModels = Record<string, ModelOption[]>;

interface ProviderConfig {
  provider: string | null;
  model: string | null;
  ollama_url: string;
  has_key: boolean;
}

const PROVIDERS: Record<string, { name: string; color: string }> = {
  openai: { name: "OpenAI", color: "text-emerald-500" },
  anthropic: { name: "Anthropic", color: "text-orange-500" },
  deepseek: { name: "DeepSeek", color: "text-blue-500" },
  ollama: { name: "Ollama", color: "text-purple-500" },
};

export interface AnalyzerContext {
  selected_symbol?: string | null;
  selected_stocks?: string[];
  active_indicators?: string[];
  signal_results?: Array<{
    symbol: string;
    signal?: string;
    reason?: string;
    entry_price?: number;
    stop_loss?: number;
    target?: number;
  }>;
  code?: string;
  backtest_metrics?: Record<string, number>;
  backtest_trade_count?: number;
  backtest_symbols?: string[];
}

export interface AIChatPanelProps {
  title?: string;
  placeholder?: string;
  tab?: string;
  onCodeGenerated?: (code: string) => void;
  onConditionsGenerated?: (conditions: Record<string, unknown>) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  analyzerContext?: AnalyzerContext;
  summarizeTrigger?: number;
}

const TOOL_LABELS: Record<string, string> = {
  list_indicators: "Browsing indicators",
  get_stock_universe: "Loading universe",
  run_manual_strategy: "Running strategy",
  run_code_strategy: "Running code",
  save_strategy: "Saving strategy",
  list_saved_strategies: "Loading strategies",
  load_strategy: "Loading strategy",
  create_batch: "Creating batch",
  list_batches: "Loading batches",
  get_snapshot_data: "Fetching data",
  run_backtest: "Running backtest",
};

function ToolCallCard({ tc }: { tc: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[tc.tool] || tc.tool;

  let preview = "";
  try {
    const parsed = JSON.parse(tc.output_preview);
    if (parsed.matched !== undefined) preview = `${parsed.matched} stocks matched`;
    else if (parsed.count !== undefined) preview = `${parsed.count} items`;
    else if (parsed.metrics) preview = `Return: ${parsed.metrics.total_return_pct?.toFixed(1)}%`;
    else if (parsed.status) preview = parsed.status;
    else if (parsed.id) preview = `ID: ${parsed.id}`;
  } catch {
    preview = tc.output_preview.slice(0, 80);
  }

  return (
    <div className="my-1 rounded border border-slate-200 bg-slate-50 text-[11px] dark:border-slate-700 dark:bg-slate-800/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-700/50"
      >
        <Wrench size={10} className="shrink-0 text-indigo-500" />
        <span className="font-medium text-slate-600 dark:text-slate-300">{label}</span>
        {preview && <span className="ml-auto truncate text-slate-400">{preview}</span>}
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>
      {expanded && (
        <div className="border-t border-slate-200 px-2 py-1 dark:border-slate-700">
          <div className="mb-1 text-[10px] font-medium text-slate-500">Input:</div>
          <pre className="mb-1 max-h-24 overflow-auto whitespace-pre-wrap text-[10px] text-slate-500">
            {JSON.stringify(tc.input, null, 2)}
          </pre>
          <div className="text-[10px] font-medium text-slate-500">Output:</div>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-[10px] text-slate-500">
            {tc.output_preview}
          </pre>
        </div>
      )}
    </div>
  );
}

function ModelSelector({
  providerConfig,
  allModels,
  onModelChange,
}: {
  providerConfig: ProviderConfig;
  allModels: ProviderModels;
  onModelChange: () => void;
}) {
  const [changing, setChanging] = useState(false);
  const provider = providerConfig.provider;
  if (!provider) return null;

  const models = allModels[provider] || [];
  const currentModel = providerConfig.model;

  async function handleModelChange(modelId: string) {
    setChanging(true);
    try {
      await apiPost("/chat/set-model", { model: modelId });
      onModelChange();
    } catch {} finally {
      setChanging(false);
    }
  }

  const providerInfo = PROVIDERS[provider];

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("text-[10px] font-semibold uppercase tracking-wider", providerInfo?.color || "text-slate-400")}>
        {providerInfo?.name || provider}
      </span>
      <select
        value={currentModel || ""}
        onChange={(e) => handleModelChange(e.target.value)}
        disabled={changing || models.length === 0}
        className="rounded border border-slate-300 bg-transparent px-1.5 py-0.5 text-[11px] font-medium text-slate-600 outline-none hover:border-indigo-400 dark:border-slate-600 dark:text-slate-300 dark:hover:border-indigo-500"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    </div>
  );
}

interface OllamaModel {
  id: string;
  name: string;
  size: number;
}

function OllamaSetupBar({ onConfigured }: { onConfigured: (models: ModelOption[]) => void }) {
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [fetching, setFetching] = useState(false);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [error, setError] = useState("");
  const [customModel, setCustomModel] = useState("");

  async function handleFetchModels() {
    setFetching(true);
    setError("");
    try {
      const data = await apiFetch<{ models: OllamaModel[]; status: string; error?: string }>(
        `/chat/ollama-models?url=${encodeURIComponent(ollamaUrl)}`
      );
      if (data.status === "error") {
        setError(data.error || "Cannot connect to Ollama");
        setModels([]);
      } else if (data.models.length === 0) {
        setError("No models installed. Run: ollama pull llama3.1");
        setModels([]);
      } else {
        setModels(data.models);
        setSelectedModel(data.models[0].id);
      }
    } catch {
      setError("Cannot connect to Ollama");
    } finally {
      setFetching(false);
    }
  }

  async function handleConnect() {
    const model = customModel.trim() || selectedModel;
    if (!model) return;
    try {
      await apiPost("/chat/set-provider", { provider: "ollama", model, ollama_url: ollamaUrl });
      const ollamaModels = models.length > 0
        ? models.map((m) => ({ id: m.id, name: m.name }))
        : [{ id: model, name: model }];
      onConfigured(ollamaModels);
    } catch {}
  }

  function formatSize(bytes: number) {
    if (!bytes) return "";
    const gb = bytes / 1e9;
    return gb >= 1 ? `${gb.toFixed(1)}GB` : `${(bytes / 1e6).toFixed(0)}MB`;
  }

  return (
    <div className="border-t border-purple-200 bg-purple-50 px-3 py-2 dark:border-purple-800 dark:bg-purple-950/30">
      {models.length > 0 && (
        <div className="mb-2 flex items-center gap-1.5">
          <select
            value={selectedModel}
            onChange={(e) => { setSelectedModel(e.target.value); setCustomModel(""); }}
            className="flex-1 rounded border border-purple-300 bg-white px-2 py-1 text-xs outline-none dark:border-purple-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {formatSize(m.size) && `(${formatSize(m.size)})`}
              </option>
            ))}
          </select>
          <button
            onClick={handleConnect}
            className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
          >
            Use
          </button>
        </div>
      )}

      {models.length === 0 && !error && !fetching && (
        <div className="mb-2 flex items-center gap-1.5">
          <input
            type="text"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            placeholder="Type model name (e.g. llama3.1)"
            className="flex-1 rounded border border-purple-300 bg-white px-2 py-1 text-xs outline-none dark:border-purple-700 dark:bg-slate-900 dark:text-slate-200"
          />
          <button
            onClick={handleConnect}
            disabled={!customModel.trim()}
            className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Use
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <Server size={12} className="shrink-0 text-purple-600" />
        <input
          type="text"
          value={ollamaUrl}
          onChange={(e) => { setOllamaUrl(e.target.value); setModels([]); setError(""); }}
          placeholder="http://localhost:11434"
          className="flex-1 rounded border border-purple-300 bg-white px-2 py-1 text-xs outline-none dark:border-purple-700 dark:bg-slate-900 dark:text-slate-200"
        />
        <button
          onClick={handleFetchModels}
          disabled={fetching}
          className="flex items-center gap-1 rounded bg-purple-600 px-2 py-1 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          <RefreshCw size={10} className={fetching ? "animate-spin" : ""} />
          {fetching ? "Scanning..." : "Fetch Models"}
        </button>
      </div>

      {error && (
        <p className="mt-1.5 text-[10px] text-red-500">{error}</p>
      )}
    </div>
  );
}

export function AIChatPanel({
  title = "Stock Picker AI",
  placeholder = "Ask me to create strategies, screen stocks, run backtests...",
  tab = "picker",
  onCodeGenerated,
  onConditionsGenerated,
  collapsed = false,
  onToggleCollapse,
  analyzerContext,
  summarizeTrigger,
}: AIChatPanelProps) {
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions(tab));
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    try { return localStorage.getItem(getActiveSessionKey(tab)); } catch { return null; }
  });
  const [showSessionList, setShowSessionList] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const messages = activeSession?.messages ?? [];

  const setMessages = useCallback((updater: Message[] | ((prev: Message[]) => Message[])) => {
    setSessions((prev) => {
      if (!activeSessionId) return prev;
      return prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        const newMsgs = typeof updater === "function" ? updater(s.messages) : updater;
        return { ...s, messages: newMsgs };
      });
    });
  }, [activeSessionId]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [systemPromptModalOpen, setSystemPromptModalOpen] = useState(false);
  const [attachedStrategies, setAttachedStrategies] = useState<StrategyAttachment[]>([]);
  const [selectedSystemPrompt, setSelectedSystemPrompt] = useState<SystemPrompt | null>(null);
  const [allStrategies, setAllStrategies] = useState<StrategyAttachment[]>([]);

  const [showOllamaSetup, setShowOllamaSetup] = useState(false);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>({ provider: null, model: null, ollama_url: "http://localhost:11434", has_key: false });
  const [allModels, setAllModels] = useState<ProviderModels>({});
  const abortRef = useRef<AbortController | null>(null);
  const lastSummarizeTrigger = useRef(0);

  // Persist sessions to localStorage
  useEffect(() => {
    saveSessions(tab, sessions);
  }, [tab, sessions]);

  useEffect(() => {
    try {
      if (activeSessionId) {
        localStorage.setItem(getActiveSessionKey(tab), activeSessionId);
      }
    } catch {}
  }, [tab, activeSessionId]);

  // Reload sessions when tab changes
  useEffect(() => {
    const loaded = loadSessions(tab);
    setSessions(loaded);
    let savedId: string | null = null;
    try { savedId = localStorage.getItem(getActiveSessionKey(tab)); } catch {}
    if (savedId && loaded.some((s) => s.id === savedId)) {
      setActiveSessionId(savedId);
    } else if (loaded.length > 0) {
      setActiveSessionId(loaded[0].id);
    } else {
      setActiveSessionId(null);
    }
  }, [tab]);

  // Auto-create first session if none exist
  useEffect(() => {
    if (sessions.length === 0) {
      const newSession: ChatSession = { id: generateSessionId(), name: "New Chat", messages: [], createdAt: Date.now() };
      setSessions([newSession]);
      setActiveSessionId(newSession.id);
    }
  }, [sessions.length]);

  function createNewSession() {
    const newSession: ChatSession = { id: generateSessionId(), name: "New Chat", messages: [], createdAt: Date.now() };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setShowSessionList(false);
  }

  function switchSession(id: string) {
    setActiveSessionId(id);
    setShowSessionList(false);
  }

  function deleteSession(id: string) {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeSessionId === id) {
        const fallback = next[0];
        if (fallback) {
          setActiveSessionId(fallback.id);
        } else {
          setActiveSessionId(null);
        }
      }
      return next;
    });
  }

  function renameSession(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, name: trimmed } : s));
    setRenamingId(null);
  }

  // Auto-name session from first user message
  function autoNameSession(msg: string) {
    if (!activeSession || activeSession.messages.length > 0 || activeSession.name !== "New Chat") return;
    const name = msg.length > 40 ? msg.slice(0, 37) + "..." : msg;
    setSessions((prev) => prev.map((s) => s.id === activeSessionId ? { ...s, name } : s));
  }

  useEffect(() => {
    fetchProviderConfig();
    fetchModels();
  }, []);

  useEffect(() => {
    fetchStrategies();
    fetchDefaultPrompt();
  }, [tab]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!summarizeTrigger || summarizeTrigger === lastSummarizeTrigger.current) return;
    lastSummarizeTrigger.current = summarizeTrigger;

    let summaryRequest = "";
    const metrics = analyzerContext?.backtest_metrics;
    if (metrics && Object.keys(metrics).length > 0) {
      const m = metrics;
      const metricLines = [
        `Total Return: ${m.total_return_pct?.toFixed(2) ?? "?"}%`,
        `Sharpe Ratio: ${m.sharpe_ratio?.toFixed(2) ?? "?"}`,
        `Max Drawdown: ${m.max_drawdown?.toFixed(2) ?? "?"}%`,
        `Win Rate: ${m.win_rate?.toFixed(1) ?? "?"}%`,
        `Profit Factor: ${m.profit_factor?.toFixed(2) ?? "?"}`,
        `Total Trades: ${m.total_trades ?? analyzerContext?.backtest_trade_count ?? "?"}`,
        `Expectancy: ${m.expectancy?.toFixed(2) ?? "?"}`,
        `Sortino: ${m.sortino_ratio?.toFixed(2) ?? "?"}`,
        `Calmar: ${m.calmar_ratio?.toFixed(2) ?? "?"}`,
        `Best Trade: ${m.best_trade?.toFixed(2) ?? "?"}`,
        `Worst Trade: ${m.worst_trade?.toFixed(2) ?? "?"}`,
        `Avg Win: ${m.avg_win?.toFixed(2) ?? "?"}`,
        `Avg Loss: ${m.avg_loss?.toFixed(2) ?? "?"}`,
        `Max Consecutive Wins: ${m.max_consecutive_wins ?? "?"}`,
        `Max Consecutive Losses: ${m.max_consecutive_losses ?? "?"}`,
      ].join(", ");
      const symbols = analyzerContext?.backtest_symbols?.join(", ") ?? "unknown";
      summaryRequest = `Summarize the backtest results for stocks [${symbols}]. Key metrics: ${metricLines}. Analyze the strategy performance: is the return adequate? Is the risk acceptable (drawdown, Sharpe)? Is the win rate sustainable with the profit factor? What are the strengths and weaknesses? Give a professional verdict and improvement suggestions.`;
    } else {
      const signalCount = analyzerContext?.signal_results?.length ?? 0;
      if (signalCount === 0) return;
      const buyCount = analyzerContext?.signal_results?.filter(s => s.signal === "BUY").length ?? 0;
      const sellCount = analyzerContext?.signal_results?.filter(s => s.signal === "SELL").length ?? 0;
      const holdCount = signalCount - buyCount - sellCount;
      summaryRequest = `Summarize the strategy run results. There are ${signalCount} signals: ${buyCount} BUY, ${sellCount} SELL, ${holdCount} HOLD. Analyze the signal distribution, highlight the best opportunities, assess risk levels, and give an overall verdict.`;
    }
    setInput("");
    const userMsg: Message = { role: "user", content: summaryRequest };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    (async () => {
      try {
        const res = await apiFetch<ChatResponse>("/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: summaryRequest,
            tab,
            system_prompt: selectedSystemPrompt?.content ?? null,
            context: analyzerContext ?? null,
          }),
          signal: controller.signal,
        });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: res.response,
            code: res.code ?? undefined,
            toolCalls: res.tool_calls?.length ? res.tool_calls : undefined,
          },
        ]);
        if (res.code && onCodeGenerated) onCodeGenerated(res.code);
        if (res.conditions && onConditionsGenerated) onConditionsGenerated(res.conditions);
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          setMessages((prev) => [...prev, { role: "assistant", content: "Generation stopped." }]);
        } else {
          setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong." }]);
        }
      } finally {
        abortRef.current = null;
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summarizeTrigger]);

  async function fetchProviderConfig() {
    try {
      const data = await apiFetch<ProviderConfig>("/chat/provider");
      if (data) setProviderConfig(data);
    } catch {}
  }

  async function fetchModels() {
    try {
      const data = await apiFetch<ProviderModels>("/chat/models");
      if (data) setAllModels(data);
    } catch {}
  }

  async function fetchStrategies() {
    try {
      const data = await apiFetch<StoredStrategy[]>("/strategies");
      setAllStrategies(
        (data ?? []).map((s) => ({
          id: Number(s.id),
          name: s.name,
          code: s.code ?? "",
          version: s.version,
          strategy_type: s.strategy_type,
        }))
      );
    } catch {
      setAllStrategies([]);
    }
  }

  async function fetchDefaultPrompt() {
    try {
      const data = await apiFetch<SystemPrompt[]>(`/system-prompts?context=${tab}`);
      const defaultPrompt = (data ?? []).find((p) => p.is_default);
      if (defaultPrompt && !selectedSystemPrompt) setSelectedSystemPrompt(defaultPrompt);
    } catch {}
  }

  function removeAttachment(id: number) {
    setAttachedStrategies((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    autoNameSession(text);
    const userMsg: Message = {
      role: "user",
      content: text,
      attachments: attachedStrategies.length > 0 ? [...attachedStrategies] : undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await apiFetch<ChatResponse>("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          tab,
          system_prompt: selectedSystemPrompt?.content ?? null,
          attachments: attachedStrategies.length > 0
            ? attachedStrategies.map((a) => ({ id: a.id, name: a.name, code: a.code }))
            : null,
          context: analyzerContext ?? null,
        }),
        signal: controller.signal,
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.response,
          code: res.code ?? undefined,
          toolCalls: res.tool_calls?.length ? res.tool_calls : undefined,
        },
      ]);
      if (res.response?.includes("No API key")) {
        fetchProviderConfig();
      }
      if (res.code && onCodeGenerated) onCodeGenerated(res.code);
      if (res.conditions && onConditionsGenerated) onConditionsGenerated(res.conditions);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setMessages((prev) => [...prev, { role: "assistant", content: "Generation stopped." }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Check your API key in the API Keys section and try again." }]);
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  const noProvider = !providerConfig.provider;

  if (collapsed) {
    return (
      <div className="flex h-full w-full flex-col items-center border-l border-slate-200 bg-slate-50 py-3 dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={onToggleCollapse}
          className="rounded p-1.5 text-slate-400 hover:bg-slate-200 hover:text-indigo-500 dark:hover:bg-slate-800"
          title="Expand AI Chat"
        >
          <PanelRightOpen size={16} />
        </button>
        <div className="mt-3 flex flex-col items-center">
          <Sparkles size={14} className="text-indigo-500" />
          <span className="mt-2 text-[10px] font-medium text-slate-400 [writing-mode:vertical-lr]">{title}</span>
        </div>
        {messages.length > 0 && (
          <div className="mt-auto rounded-full bg-indigo-500 px-1 py-0.5 text-[9px] font-bold text-white">
            {messages.length}
          </div>
        )}
        {sessions.length > 1 && (
          <div className="mt-1 rounded-full bg-slate-300 px-1 py-0.5 text-[9px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {sessions.length}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-slate-900">
      {/* Header with model selector */}
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-indigo-500" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</span>
          {providerConfig.provider && (
            <>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <ModelSelector providerConfig={providerConfig} allModels={allModels} onModelChange={fetchProviderConfig} />
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowOllamaSetup((v) => !v)}
            className={cn(
              "rounded p-1 transition-colors",
              showOllamaSetup
                ? "bg-purple-100 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400"
                : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
            title="Connect Ollama (local)"
          >
            <Server size={14} />
          </button>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-indigo-500 dark:hover:bg-slate-800"
              title="Collapse AI Chat"
            >
              <PanelRightClose size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Session selector bar */}
      <div className="relative flex items-center gap-1 border-b border-slate-200 px-2 py-1 dark:border-slate-800">
        <button
          onClick={createNewSession}
          className="rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-500 dark:hover:bg-indigo-950/50"
          title="New chat session"
        >
          <Plus size={14} />
        </button>
        <button
          onClick={() => setShowSessionList((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <MessageSquare size={12} className="shrink-0 text-indigo-400" />
          <span className="truncate">{activeSession?.name ?? "New Chat"}</span>
          <ChevronDown size={12} className={cn("ml-auto shrink-0 transition-transform", showSessionList && "rotate-180")} />
        </button>
        {showSessionList && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => { setShowSessionList(false); setRenamingId(null); }} />
            <div className="absolute left-0 right-0 top-full z-50 max-h-60 overflow-y-auto rounded-b-md border border-t-0 border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "group flex items-center gap-1.5 px-2 py-1.5 text-xs",
                    s.id === activeSessionId
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                      : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  )}
                >
                  <MessageSquare size={11} className="shrink-0" />
                  {renamingId === s.id ? (
                    <form
                      className="flex min-w-0 flex-1 items-center gap-1"
                      onSubmit={(e) => { e.preventDefault(); renameSession(s.id, renameValue); }}
                    >
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => renameSession(s.id, renameValue)}
                        className="min-w-0 flex-1 rounded border border-indigo-300 bg-white px-1 py-0.5 text-xs outline-none dark:border-indigo-700 dark:bg-slate-800"
                        onKeyDown={(e) => { if (e.key === "Escape") setRenamingId(null); }}
                      />
                      <button type="submit" className="rounded p-0.5 text-emerald-500 hover:bg-emerald-50">
                        <Check size={11} />
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        onClick={() => switchSession(s.id)}
                        className="min-w-0 flex-1 truncate text-left"
                      >
                        {s.name}
                      </button>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {s.messages.length > 0 ? `${s.messages.length} msg` : "empty"}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setRenamingId(s.id); setRenameValue(s.name); }}
                        className="shrink-0 rounded p-0.5 text-slate-400 opacity-0 hover:bg-slate-200 hover:text-slate-600 group-hover:opacity-100 dark:hover:bg-slate-700"
                        title="Rename"
                      >
                        <Pencil size={11} />
                      </button>
                      {sessions.length > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                          className="shrink-0 rounded p-0.5 text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-950/30"
                          title="Delete session"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="space-y-2 py-6 text-center">
            <Sparkles size={24} className="mx-auto text-indigo-400" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">AI Stock Picker Agent</p>
            <p className="mx-auto max-w-[240px] text-xs text-slate-400 dark:text-slate-500">
              Create strategies, screen stocks, run backtests, and manage watchlists — all through conversation.
            </p>
            {providerConfig.provider ? (
              <p className="text-[10px] text-slate-400">
                Using <span className="font-semibold">{PROVIDERS[providerConfig.provider]?.name ?? providerConfig.provider}</span>
                {providerConfig.model && <> &middot; {providerConfig.model}</>}
              </p>
            ) : (
              <div className="mx-auto max-w-[240px] rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                <Key size={12} className="mb-1 inline-block" /> Add an LLM API key in{" "}
                <span className="font-semibold">API Keys</span> (sidebar) to get started, or connect Ollama via the{" "}
                <Server size={10} className="inline-block" /> icon above.
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-1 pt-2">
              {(tab === "analyzer"
                ? ["Analyze selected stocks", "Generate buy/sell signals", "Suggest a strategy for these stocks", "Summarize my results"]
                : ["Find oversold large caps", "Create momentum strategy", "Backtest RSI strategy"]
              ).map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-700 dark:hover:text-indigo-400"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={cn(
                "max-w-[90%] rounded-lg px-3 py-2 text-sm",
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200"
              )}
            >
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {msg.attachments.map((a) => (
                    <span
                      key={a.id}
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                        msg.role === "user"
                          ? "bg-indigo-500 text-indigo-100"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                      )}
                    >
                      <Paperclip size={9} />
                      {a.name}
                    </span>
                  ))}
                </div>
              )}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="mb-2">
                  {msg.toolCalls.map((tc, j) => (
                    <ToolCallCard key={j} tc={tc} />
                  ))}
                </div>
              )}
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.code && (
                <pre className="mt-2 overflow-x-auto rounded bg-slate-950 p-2 text-xs text-emerald-400">
                  <code>{msg.code}</code>
                </pre>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-400 shadow-sm dark:bg-slate-800">
            <Loader2 size={14} className="animate-spin text-indigo-500" />
            <span>Agent is working...</span>
            <span className="text-[10px] text-slate-300 dark:text-slate-500">(check activity log below)</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Attached items bar */}
      {(selectedSystemPrompt || attachedStrategies.length > 0) && (
        <div className="flex flex-wrap gap-1 border-t border-slate-200 px-3 py-1.5 dark:border-slate-800">
          {selectedSystemPrompt && (
            <span className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-400">
              <Bot size={10} />
              {selectedSystemPrompt.name}
              <button
                onClick={() => setSelectedSystemPrompt(null)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-violet-100 dark:hover:bg-violet-900"
              >
                <X size={10} />
              </button>
            </span>
          )}
          {attachedStrategies.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-400"
            >
              <Paperclip size={10} />
              {a.name}
              <button
                onClick={() => removeAttachment(a.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Ollama setup bar */}
      {showOllamaSetup && (
        <OllamaSetupBar onConfigured={(ollamaModels) => {
          setShowOllamaSetup(false);
          fetchProviderConfig();
          if (ollamaModels.length > 0) {
            setAllModels((prev) => ({ ...prev, ollama: ollamaModels }));
          }
        }} />
      )}

      {/* Summarize results bar — shown when analyzer has signal results */}
      {tab === "analyzer" && analyzerContext?.signal_results && analyzerContext.signal_results.length > 0 && !loading && (
        <div className="flex items-center gap-2 border-t border-emerald-200 bg-emerald-50 px-3 py-1.5 dark:border-emerald-800 dark:bg-emerald-950/30">
          <Sparkles size={12} className="text-emerald-600 dark:text-emerald-400" />
          <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
            {analyzerContext.signal_results.length} signal results available
          </span>
          <button
            onClick={() => {
              const count = analyzerContext.signal_results!.length;
              const buys = analyzerContext.signal_results!.filter(s => s.signal === "BUY").length;
              const sells = analyzerContext.signal_results!.filter(s => s.signal === "SELL").length;
              setInput(`Summarize the ${count} signal results (${buys} BUY, ${sells} SELL). What are the best opportunities and key risks?`);
            }}
            className="ml-auto rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
          >
            Summarize Results
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="border-t border-slate-200 p-2 dark:border-slate-800">
        <div className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950">
          <button
            onClick={() => setSystemPromptModalOpen(true)}
            className={cn(
              "rounded p-1 transition-colors",
              selectedSystemPrompt
                ? "text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
            title={selectedSystemPrompt ? `System: ${selectedSystemPrompt.name}` : "System Prompt"}
          >
            <Bot size={15} />
          </button>
          <button
            onClick={() => setAttachModalOpen(true)}
            className={cn(
              "rounded p-1 transition-colors",
              attachedStrategies.length > 0
                ? "text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
            title="Attach strategy"
          >
            <Paperclip size={15} />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-slate-200"
          />
          {loading ? (
            <button
              onClick={handleStop}
              className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
              aria-label="Stop"
              title="Stop generation"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-500 disabled:opacity-50 dark:hover:bg-slate-800"
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>

      <AttachStrategyModal
        open={attachModalOpen}
        onClose={() => setAttachModalOpen(false)}
        strategies={allStrategies}
        attached={attachedStrategies}
        onAttach={setAttachedStrategies}
      />

      <SystemPromptModal
        open={systemPromptModalOpen}
        onClose={() => setSystemPromptModalOpen(false)}
        context={tab}
        selectedPromptId={selectedSystemPrompt?.id ?? null}
        onSelect={setSelectedSystemPrompt}
      />
    </div>
  );
}
