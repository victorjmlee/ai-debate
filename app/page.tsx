"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { detectLocale, getTranslations, type Locale, type Translations } from "./i18n/translations";
import { PROVIDER_MODEL_OPTIONS } from "./config/models";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ModelResponse {
  modelKey: string;
  modelName: string;
  answer: string;
  error?: string;
  tokensUsed?: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ModelOption {
  key: string;
  name: string;
  provider: string;
  color: string;
  glow: string;
}

interface ApiKeys {
  anthropic: string;
  openai: string;
  google: string;
}

interface Session {
  id: number;
  question: string;
  selectedModels: string[];
  round1: Record<string, ModelResponse> | null;
  round2: Record<string, ModelResponse> | null;
  synthesis: ModelResponse | null;
  chatHistories: Record<string, ChatMessage[]>;
  synthesisChatHistory: ChatMessage[];
  deepStep: "idle" | "review" | "synthesis" | "done";
  timestamp: number;
}

const MODELS: ModelOption[] = [
  { key: "claude-haiku", name: "Claude Haiku 4.5", provider: "Anthropic", color: "#3B82F6", glow: "rgba(59,130,246,0.15)" },
  { key: "gpt-5-mini", name: "GPT-5 Mini", provider: "OpenAI", color: "#10B981", glow: "rgba(16,185,129,0.15)" },
  { key: "gemini", name: "Gemini 2.5 Flash", provider: "Google", color: "#F59E0B", glow: "rgba(245,158,11,0.15)" },
];

const TONE_PRESETS = [
  {
    id: "technical",
    label: { en: "Technical", ko: "기술적" },
    instruction: "Write in a technical, detailed style. Include specific steps, commands, or relevant implementation details.",
  },
  {
    id: "concise",
    label: { en: "Concise", ko: "간결하게" },
    instruction: "Be extremely concise. Use bullet points. Limit to 5 key points. No filler.",
  },
  {
    id: "customer",
    label: { en: "Customer-facing", ko: "고객 대응용" },
    instruction: "Write in a professional, empathetic tone for customer communication. Avoid technical jargon. Be clear, reassuring, and actionable.",
  },
  {
    id: "executive",
    label: { en: "Executive", ko: "임원 보고용" },
    instruction: "Write an executive summary. Lead with the key recommendation. Keep it under 3 concise paragraphs.",
  },
] as const;

type ViewMode = "input" | "compare" | "deep-analysis";

const API_KEYS_STORAGE_KEY = "ai-debate-api-keys";
const EMPTY_API_KEYS: ApiKeys = { anthropic: "", openai: "", google: "" };

function toRequestApiKeys(apiKeys: ApiKeys) {
  return {
    anthropic: apiKeys.anthropic.trim(),
    openai: apiKeys.openai.trim(),
    google: apiKeys.google.trim(),
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DebateArena() {
  const [locale, setLocale] = useState<Locale>("en");
  const t = useMemo(() => getTranslations(locale), [locale]);

  useEffect(() => {
    const detected = detectLocale();
    setLocale(detected);
    document.documentElement.lang = detected;
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>("input");
  const [question, setQuestion] = useState("");
  const [availableModels, setAvailableModels] = useState<Record<string, boolean> | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKeys>(EMPTY_API_KEYS);
  const [apiKeyDraft, setApiKeyDraft] = useState<ApiKeys>(EMPTY_API_KEYS);
  const [apiKeysLoaded, setApiKeysLoaded] = useState(false);
  const [apiKeyPanelOpen, setApiKeyPanelOpen] = useState(false);
  const [modelOverrides, setModelOverrides] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const [key, options] of Object.entries(PROVIDER_MODEL_OPTIONS)) {
      if (options[0]) defaults[key] = options[0].apiModel;
    }
    return defaults;
  });

  // Session history (persisted to localStorage)
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const nextSessionId = useRef(1);
  const sessionsLoaded = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Compare view
  const [round1, setRound1] = useState<Record<string, ModelResponse> | null>(null);

  // Inline chat (within compare view cards)
  const [activeChatModel, setActiveChatModel] = useState<string | null>(null);
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMessage[]>>({});
  const [chatInputs, setChatInputs] = useState<Record<string, string>>({});
  const [chatLoading, setChatLoading] = useState<string | null>(null); // modelKey being loaded
  const chatEndRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const chatInputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Deep Analysis
  const [round2, setRound2] = useState<Record<string, ModelResponse> | null>(null);
  const [synthesis, setSynthesis] = useState<ModelResponse | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepStep, setDeepStep] = useState<"idle" | "review" | "synthesis" | "done">("idle");
  const [toneInstruction, setToneInstruction] = useState("");
  const [context, setContext] = useState("");
  const [contextOpen, setContextOpen] = useState(false);

  // Synthesis chat
  const [synthesisChatHistory, setSynthesisChatHistory] = useState<ChatMessage[]>([]);
  const [synthesisChatInput, setSynthesisChatInput] = useState("");
  const [synthesisChatLoading, setSynthesisChatLoading] = useState(false);
  const synthesisChatEndRef = useRef<HTMLDivElement>(null);
  const synthesisChatInputRef = useRef<HTMLTextAreaElement>(null);

  // Load sessions from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ai-debate-sessions");
      if (saved) {
        const parsed: Session[] = JSON.parse(saved);
        setSessions(parsed);
        const maxId = parsed.reduce((max, s) => Math.max(max, s.id), 0);
        nextSessionId.current = maxId + 1;
      }
    } catch { /* ignore */ }
    sessionsLoaded.current = true;
  }, []);

  // Load API keys from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(API_KEYS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ApiKeys>;
        const keys = {
          anthropic: parsed.anthropic ?? "",
          openai: parsed.openai ?? "",
          google: parsed.google ?? "",
        };
        setApiKeys(keys);
        setApiKeyDraft(keys);
      }
    } catch { /* ignore */ }
    setApiKeysLoaded(true);
  }, []);

  // Persist sessions to localStorage when they change
  useEffect(() => {
    if (!sessionsLoaded.current) return; // skip initial empty state
    try {
      localStorage.setItem("ai-debate-sessions", JSON.stringify(sessions));
    } catch { /* ignore — quota exceeded etc. */ }
  }, [sessions]);

  // Auto-open API key panel when no keys saved
  useEffect(() => {
    if (!apiKeysLoaded) return;
    const hasKeys = Object.values(apiKeys).some((k) => k.trim());
    if (!hasKeys) setApiKeyPanelOpen(true);
  }, [apiKeysLoaded, apiKeys]);

  // Fetch available models from server env keys plus browser-saved personal keys.
  useEffect(() => {
    if (!apiKeysLoaded) return;

    fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKeys: toRequestApiKeys(apiKeys) }),
    })
      .then((res) => res.json())
      .then((data) => {
        const available = data.available as Record<string, boolean>;
        setAvailableModels(available);
        const keys = Object.entries(data.available as Record<string, boolean>)
          .filter(([, v]) => v)
          .map(([k]) => k);
        setSelectedModels((prev) => {
          const kept = prev.filter((key) => available[key]);
          return kept.length > 0 ? kept : keys;
        });
      })
      .catch(() => setAvailableModels({}));
  }, [apiKeys, apiKeysLoaded]);

  // Auto-scroll chat when messages change
  useEffect(() => {
    if (activeChatModel) {
      chatEndRefs.current[activeChatModel]?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeChatModel, chatHistories, chatLoading]);

  // Auto-scroll synthesis chat
  useEffect(() => {
    synthesisChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [synthesisChatHistory.length, synthesisChatLoading]);

  // Auto-focus chat input when activating a card
  useEffect(() => {
    if (activeChatModel) {
      setTimeout(() => chatInputRefs.current[activeChatModel]?.focus(), 200);
    }
  }, [activeChatModel]);

  const toggleModel = (key: string) => {
    if (!availableModels?.[key]) return;
    setSelectedModels((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const getModel = (key: string) => MODELS.find((m) => m.key === key);

  const savedKeyCount = Object.values(apiKeys).filter((key) => key.trim()).length;
  const openApiKeyPanel = useCallback(() => {
    setApiKeyDraft(apiKeys);
    setApiKeyPanelOpen(true);
  }, [apiKeys]);

  const saveApiKeys = async () => {
    const keys = toRequestApiKeys(apiKeyDraft);
    setApiKeys(keys);
    setApiKeyDraft(keys);
    setApiKeyPanelOpen(false);
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys));
  };

  const clearApiKeys = async () => {
    setApiKeys(EMPTY_API_KEYS);
    setApiKeyDraft(EMPTY_API_KEYS);
    setApiKeyPanelOpen(false);
    localStorage.removeItem(API_KEYS_STORAGE_KEY);
  };

  // ─── Compare Flow ──────────────────────────────────────────────────────────

  const startCompare = async () => {
    if (!question.trim() || selectedModels.length === 0 || loading) return;
    const effectiveQuestion = context.trim()
      ? `Background Context:\n${context.trim()}\n\n---\n\nQuestion / Request:\n${question.trim()}`
      : question.trim();
    // Assign a new session ID for this comparison
    const newId = nextSessionId.current++;
    setActiveSessionId(newId);
    setRound1(null);
    setRound2(null);
    setSynthesis(null);
    setDeepStep("idle");
    setActiveChatModel(null);
    setChatHistories({});
    setChatInputs({});
    setSynthesisChatHistory([]);
    setSynthesisChatInput("");
    setLoading(true);
    setViewMode("compare");

    try {
      const res = await fetch("/api/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: effectiveQuestion,
          models: selectedModels,
          round: 1,
          locale,
          apiKeys: toRequestApiKeys(apiKeys),
          modelOverrides,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.requestFailed);
      if (data.responses) setRound1(data.responses);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t.unknownError;
      alert(msg);
      setViewMode("input");
    } finally {
      setLoading(false);
    }
  };

  // ─── Inline Chat ──────────────────────────────────────────────────────────

  const openChat = (modelKey: string) => {
    setActiveChatModel(modelKey);
    // Initialize chat history if not present
    setChatHistories((prev) => {
      if (prev[modelKey]) return prev;
      const initialAnswer = round1?.[modelKey]?.answer ?? "";
      return {
        ...prev,
        [modelKey]: [
          { role: "user", content: question },
          { role: "assistant", content: initialAnswer },
        ],
      };
    });
  };

  const closeChat = () => {
    setActiveChatModel(null);
  };

  const getChatInput = (modelKey: string) => chatInputs[modelKey] ?? "";

  const setChatInput = (modelKey: string, value: string) => {
    setChatInputs((prev) => ({ ...prev, [modelKey]: value }));
  };

  const sendChat = async (modelKey: string) => {
    const input = getChatInput(modelKey).trim();
    if (!input || chatLoading) return;

    const history = chatHistories[modelKey] ?? [];
    const userMsg: ChatMessage = { role: "user", content: input };
    const updatedHistory = [...history, userMsg];
    setChatHistories((prev) => ({ ...prev, [modelKey]: updatedHistory }));
    setChatInput(modelKey, "");
    setChatLoading(modelKey);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelKey,
          messages: updatedHistory,
          locale,
          apiKeys: toRequestApiKeys(apiKeys),
          modelOverrides,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.requestFailed);

      setChatHistories((prev) => ({
        ...prev,
        [modelKey]: [...(prev[modelKey] ?? []), { role: "assistant", content: data.response?.answer ?? "" }],
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t.unknownError;
      setChatHistories((prev) => ({
        ...prev,
        [modelKey]: [...(prev[modelKey] ?? []), { role: "assistant", content: `[Error: ${msg}]` }],
      }));
    } finally {
      setChatLoading(null);
    }
  };

  // ─── Synthesis Chat ────────────────────────────────────────────────────────

  const initSynthesisChat = () => {
    if (synthesisChatHistory.length > 0) return; // already initialized
    if (!synthesis) return;
    setSynthesisChatHistory([
      { role: "user", content: t.synthesisIntro(synthesis.answer) },
      { role: "assistant", content: synthesis.answer },
    ]);
    setTimeout(() => synthesisChatInputRef.current?.focus(), 200);
  };

  const sendSynthesisChat = async () => {
    const input = synthesisChatInput.trim();
    if (!input || synthesisChatLoading) return;

    const userMsg: ChatMessage = { role: "user", content: input };
    const updatedHistory = [...synthesisChatHistory, userMsg];
    setSynthesisChatHistory(updatedHistory);
    setSynthesisChatInput("");
    setSynthesisChatLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "synthesis",
          messages: updatedHistory,
          locale,
          apiKeys: toRequestApiKeys(apiKeys),
          modelOverrides,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.requestFailed);

      setSynthesisChatHistory((prev) => [
        ...prev,
        { role: "assistant", content: data.response?.answer ?? "" },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t.unknownError;
      setSynthesisChatHistory((prev) => [
        ...prev,
        { role: "assistant", content: `[Error: ${msg}]` },
      ]);
    } finally {
      setSynthesisChatLoading(false);
    }
  };

  // ─── Deep Analysis Flow ────────────────────────────────────────────────────

  const startDeepAnalysis = async () => {
    if (!round1) return;
    setViewMode("deep-analysis");
    setDeepLoading(true);
    setDeepStep("review");

    // Include follow-up chat history with initial answers if available
    const enrichedResponses: Record<string, ModelResponse> = {};
    for (const [key, resp] of Object.entries(round1)) {
      const extra = (chatHistories[key] ?? []).slice(2);
      if (extra.length > 0) {
        const chatSummary = extra
          .map((msg) => msg.role === "user" ? t.followUpQ(msg.content) : t.followUpA(msg.content))
          .join("\n\n");
        enrichedResponses[key] = {
          ...resp,
          answer: `${resp.answer}\n\n${t.followUpConversation}\n\n${chatSummary}`,
        };
      } else {
        enrichedResponses[key] = resp;
      }
    }

    try {
      // Round 2: Cross Review
      const res2 = await fetch("/api/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          models: selectedModels,
          round: 2,
          locale,
          apiKeys: toRequestApiKeys(apiKeys),
          modelOverrides,
          previousResponses: enrichedResponses,
        }),
      });
      const data2 = await res2.json();
      if (!res2.ok) throw new Error(data2.error || "Request failed");
      if (data2.responses) setRound2(data2.responses);

      // Round 3: Synthesis
      setDeepStep("synthesis");
      const res3 = await fetch("/api/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          models: selectedModels,
          round: 3,
          locale,
          apiKeys: toRequestApiKeys(apiKeys),
          modelOverrides,
          previousResponses: data2.responses,
          toneInstruction: toneInstruction.trim() || undefined,
        }),
      });
      const data3 = await res3.json();
      if (!res3.ok) throw new Error(data3.error || "Request failed");
      if (data3.synthesis) setSynthesis(data3.synthesis);
      setDeepStep("done");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t.unknownError;
      alert(msg);
    } finally {
      setDeepLoading(false);
    }
  };

  // ─── Session Management ─────────────────────────────────────────────────────

  const saveCurrentSession = () => {
    if (!round1 || !question.trim()) return null;
    const session: Session = {
      id: activeSessionId ?? nextSessionId.current++,
      question,
      selectedModels,
      round1,
      round2,
      synthesis,
      chatHistories: { ...chatHistories },
      synthesisChatHistory: [...synthesisChatHistory],
      deepStep,
      timestamp: Date.now(),
    };
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== session.id);
      return [session, ...filtered];
    });
    return session.id;
  };

  const restoreSession = (session: Session) => {
    setQuestion(session.question);
    setSelectedModels(session.selectedModels);
    setRound1(session.round1);
    setRound2(session.round2);
    setSynthesis(session.synthesis);
    setChatHistories(session.chatHistories);
    setSynthesisChatHistory(session.synthesisChatHistory);
    setDeepStep(session.deepStep);
    setActiveChatModel(null);
    setChatInputs({});
    setSynthesisChatInput("");
    setActiveSessionId(session.id);
    setViewMode(session.deepStep !== "idle" ? "deep-analysis" : "compare");
  };

  const deleteSession = (id: number) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) setActiveSessionId(null);
  };

  const startNew = () => {
    // Save current session before clearing
    saveCurrentSession();
    setViewMode("input");
    setQuestion("");
    setContext("");
    setContextOpen(false);
    setRound1(null);
    setRound2(null);
    setSynthesis(null);
    setActiveChatModel(null);
    setChatHistories({});
    setChatInputs({});
    setDeepStep("idle");
    setSynthesisChatHistory([]);
    setSynthesisChatInput("");
    setActiveSessionId(null);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative z-10 min-h-screen flex">
      {/* ── Sidebar ── */}
      <aside
        className="fixed top-0 left-0 h-full z-30 flex flex-col border-r border-[var(--border-dim)] bg-[var(--bg-surface)] transition-all duration-300 overflow-hidden"
        style={{ width: sidebarOpen ? "280px" : "0px" }}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border-dim)] shrink-0">
          <span className="text-xs font-mono text-[var(--text-muted)] tracking-wider uppercase">{t.history}</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="px-3 py-3 shrink-0">
          <button
            onClick={() => { startNew(); setSidebarOpen(false); }}
            className="w-full rounded-lg border border-[var(--border-dim)] hover:border-[var(--border-subtle)] px-3 py-2.5 text-sm font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer text-left"
          >
            {t.newChat}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 chat-scroll-area">
          {sessions.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] text-center mt-8 font-mono">{t.noHistory}</p>
          ) : (
            <div className="space-y-1.5">
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                const hasDeep = session.deepStep === "done";
                const timeAgo = getTimeAgo(session.timestamp, t);
                return (
                  <div
                    key={session.id}
                    className="group rounded-lg px-3 py-2.5 transition-all cursor-pointer"
                    style={{
                      background: isActive ? "var(--bg-elevated)" : "transparent",
                      borderLeft: isActive ? "2px solid var(--text-secondary)" : "2px solid transparent",
                    }}
                    onClick={() => { restoreSession(session); setSidebarOpen(false); }}
                  >
                    <div className="flex items-start gap-2">
                      {/* Model dots */}
                      <div className="flex -space-x-1 shrink-0 mt-1">
                        {session.selectedModels.slice(0, 3).map((key) => {
                          const m = getModel(key);
                          return (
                            <div
                              key={key}
                              className="w-2 h-2 rounded-full"
                              style={{ background: m?.color ?? "#888" }}
                            />
                          );
                        })}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-primary)] truncate leading-tight">
                          {session.question}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {hasDeep && (
                            <span className="text-[9px] font-mono text-[#D4AF37]">Deep</span>
                          )}
                          <span className="text-[9px] font-mono text-[var(--text-muted)]">
                            {timeAgo}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                        className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-all text-[10px] cursor-pointer shrink-0 mt-0.5"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* ── Header ── */}
        <header className="border-b border-[var(--border-dim)] px-6 py-5">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Sidebar toggle */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer text-lg"
                title={t.history}
              >
                ☰
              </button>
              <div className="cursor-pointer" onClick={viewMode !== "input" ? startNew : undefined}>
                <h1 className="text-2xl font-extrabold tracking-tight">
                  <span className="bg-gradient-to-r from-blue-400 via-emerald-400 to-amber-400 bg-clip-text text-transparent">
                    AI Debate Arena
                  </span>
                </h1>
                <p className="text-xs font-mono text-[var(--text-muted)] mt-1 tracking-widest uppercase">
                  Compare · Choose · Chat
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {viewMode !== "input" && (
                <button
                  onClick={startNew}
                  className="text-sm font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg px-4 py-2 transition-all hover:border-[var(--text-muted)] cursor-pointer"
                >
                  + New
                </button>
              )}
              <button
                type="button"
                aria-expanded={apiKeyPanelOpen}
                aria-controls="api-key-panel"
                onPointerDown={(e) => {
                  if (e.button === 0) openApiKeyPanel();
                }}
                onClick={openApiKeyPanel}
                className="text-sm font-mono border rounded-lg px-4 py-2 transition-all cursor-pointer"
                style={{
                  borderColor: savedKeyCount > 0 ? "var(--border-subtle)" : "#D4AF3744",
                  color: savedKeyCount > 0 ? "var(--text-secondary)" : "#D4AF37",
                  background: savedKeyCount > 0 ? "transparent" : "rgba(212,175,55,0.06)",
                }}
              >
                API Keys{savedKeyCount > 0 ? ` · ${savedKeyCount}` : ""}
              </button>
            </div>
          </div>
        </header>

        {apiKeyPanelOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="api-key-panel-title"
          >
            <div
              id="api-key-panel"
              className="w-full max-w-lg rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
                <div>
                  <h2 id="api-key-panel-title" className="text-base font-bold text-[var(--text-primary)]">API Keys</h2>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Stored only in this browser.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setApiKeyPanelOpen(false)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4 px-5 py-5">
                <ApiKeyInput
                  label="Anthropic"
                  value={apiKeyDraft.anthropic}
                  placeholder="sk-ant-..."
                  onChange={(value) => setApiKeyDraft((prev) => ({ ...prev, anthropic: value }))}
                />
                <ApiKeyInput
                  label="OpenAI"
                  value={apiKeyDraft.openai}
                  placeholder="sk-..."
                  onChange={(value) => setApiKeyDraft((prev) => ({ ...prev, openai: value }))}
                />
                <ApiKeyInput
                  label="Google"
                  value={apiKeyDraft.google}
                  placeholder="AI..."
                  onChange={(value) => setApiKeyDraft((prev) => ({ ...prev, google: value }))}
                />
              </div>
              <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-5 py-4">
                <button
                  type="button"
                  onClick={clearApiKeys}
                  className="text-xs font-mono text-[var(--text-muted)] hover:text-red-400 transition-colors cursor-pointer"
                >
                  Clear saved keys
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setApiKeyPanelOpen(false)}
                    className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveApiKeys}
                    className="rounded-lg px-4 py-2 text-sm font-bold text-white transition-opacity cursor-pointer"
                    style={{ background: "linear-gradient(135deg, #3B82F6, #10B981)" }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* ═══════════════════ INPUT VIEW ═══════════════════ */}
      {viewMode === "input" && (
        <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12 animate-fade-up">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-3">
              {t.heroTitle}
            </h2>
            <p className="text-[var(--text-secondary)] text-lg">
              {t.heroSubtitle}
            </p>
          </div>

          {/* Context (optional) */}
          <div className="mb-4">
            <button
              onClick={() => setContextOpen(!contextOpen)}
              className="flex items-center gap-2 text-xs font-mono tracking-wider uppercase transition-colors cursor-pointer mb-2 group"
              style={{ color: contextOpen || context.trim() ? "#3B82F6" : "var(--text-muted)" }}
            >
              <span
                className="transition-transform duration-200 text-[10px]"
                style={{ display: "inline-block", transform: contextOpen ? "rotate(90deg)" : "rotate(0deg)" }}
              >
                ▶
              </span>
              {t.addContext}
              {!contextOpen && context.trim() && (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "rgba(59,130,246,0.15)", color: "#3B82F6" }}>
                  {locale === "ko" ? "입력됨" : "Added"}
                </span>
              )}
            </button>
            {contextOpen && (
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder={t.contextPlaceholder}
                rows={6}
                autoFocus
                className="w-full rounded-xl px-5 py-4 text-sm placeholder-[var(--text-muted)] focus:outline-none transition-all resize-none"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid #3B82F630",
                  color: "var(--text-secondary)",
                  boxShadow: "inset 0 1px 0 rgba(59,130,246,0.05)",
                }}
              />
            )}
          </div>

          {/* Question */}
          <div className="mb-8">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t.inputPlaceholder}
              rows={4}
              className="w-full bg-[var(--bg-card)] border border-[var(--border-dim)] rounded-xl px-5 py-4 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none text-lg"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) startCompare();
              }}
            />
          </div>

          {/* Model Selector */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-mono text-[var(--text-muted)] tracking-wider uppercase">
                Models
              </label>
              <span className="text-xs text-[var(--text-muted)]">
                {selectedModels.length} / {MODELS.length} selected
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {MODELS.map((model) => {
                const isAvailable = availableModels?.[model.key] ?? false;
                const selected = selectedModels.includes(model.key);
                const options = PROVIDER_MODEL_OPTIONS[model.key] ?? [];
                const currentOverride = modelOverrides[model.key] ?? options[0]?.apiModel ?? "";
                const currentModelName = options.find((o) => o.apiModel === currentOverride)?.displayName ?? model.name;
                return (
                  <div
                    key={model.key}
                    className="group relative rounded-xl border transition-all duration-300 overflow-hidden"
                    style={{
                      borderColor: selected ? model.color : "var(--border-dim)",
                      background: selected
                        ? `linear-gradient(160deg, ${model.color}18 0%, ${model.color}06 100%)`
                        : "var(--bg-card)",
                      boxShadow: selected ? `0 0 28px ${model.color}20, inset 0 1px 0 ${model.color}25` : "none",
                      opacity: isAvailable ? 1 : 0.35,
                    }}
                  >
                    {/* Colored top accent bar */}
                    <div
                      className="h-1 w-full transition-all duration-300"
                      style={{ background: selected ? `linear-gradient(90deg, ${model.color}, ${model.color}88)` : "var(--border-dim)" }}
                    />
                    {/* Toggle area */}
                    <button
                      onClick={() => toggleModel(model.key)}
                      disabled={!isAvailable}
                      className="w-full px-5 pt-4 pb-3 text-left cursor-pointer disabled:cursor-not-allowed"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 shrink-0"
                          style={{
                            background: selected ? model.color : "transparent",
                            border: `2px solid ${selected ? model.color : "var(--border-subtle)"}`,
                            boxShadow: selected ? `0 0 10px ${model.color}80` : "none",
                          }}
                        >
                          {selected && <span className="text-[9px] font-bold text-white">✓</span>}
                        </div>
                        {!isAvailable && (
                          <span className="text-[9px] font-mono text-[var(--text-muted)] border border-[var(--border-dim)] rounded px-1.5 py-0.5">
                            {t.noApiKey}
                          </span>
                        )}
                      </div>
                      <span
                        className="text-xl font-bold block transition-colors leading-tight"
                        style={{ color: selected ? model.color : "var(--text-secondary)" }}
                      >
                        {model.provider}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] mt-1 block font-mono">
                        {currentModelName}
                      </span>
                    </button>
                    {/* Model version selector */}
                    {isAvailable && options.length > 1 && (
                      <div className="px-4 pb-4">
                        <select
                          value={currentOverride}
                          onChange={(e) => {
                            e.stopPropagation();
                            setModelOverrides((prev) => ({ ...prev, [model.key]: e.target.value }));
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full rounded-md px-2 py-1.5 text-[11px] font-mono cursor-pointer focus:outline-none transition-colors"
                          style={{
                            background: "var(--bg-elevated)",
                            border: `1px solid ${selected ? model.color + "44" : "var(--border-subtle)"}`,
                            color: selected ? model.color : "var(--text-secondary)",
                          }}
                        >
                          {options.map((opt) => (
                            <option key={opt.apiModel} value={opt.apiModel}>
                              {opt.displayName}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {availableModels && Object.values(availableModels).every((v) => !v) && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="text-sm text-red-400 font-mono">
                  {t.noApiKeys}
                </p>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    if (e.button === 0) openApiKeyPanel();
                  }}
                  onClick={openApiKeyPanel}
                  className="rounded-lg border border-[#D4AF3744] px-3 py-1.5 text-xs font-mono text-[#D4AF37] transition-colors hover:border-[#D4AF37]"
                >
                  API Keys
                </button>
              </div>
            )}
          </div>

          {/* Start Button */}
          <button
            onClick={startCompare}
            disabled={!question.trim() || selectedModels.length === 0 || !Object.values(apiKeys).some((k) => k.trim())}
            className="w-full relative overflow-hidden rounded-xl py-4 text-base font-bold tracking-wide transition-all duration-300 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg, #3B82F6 0%, #10B981 50%, #F59E0B 100%)",
            }}
          >
            <span className="relative z-10 text-white drop-shadow-sm">
              {t.compareButton}
            </span>
          </button>
          <p className="text-center text-xs text-[var(--text-muted)] mt-3 font-mono">
            ⌘ + Enter
          </p>

        </main>
      )}

      {/* ═══════════════════ COMPARE VIEW ═══════════════════ */}
      {viewMode === "compare" && (
        <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 animate-fade-up">
          {/* Question Display */}
          <div className="mb-6 bg-[var(--bg-card)] border border-[var(--border-dim)] rounded-xl px-6 py-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-[var(--text-muted)] tracking-wider uppercase">
                {t.question}
              </span>
              {context.trim() && (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-mono font-bold" style={{ background: "rgba(59,130,246,0.15)", color: "#3B82F6" }}>
                  + context
                </span>
              )}
            </div>
            <p className="text-lg text-[var(--text-primary)]">{question}</p>
          </div>

          {/* Model Response Cards */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {selectedModels.map((key, i) => (
                <LoadingCard key={key} color={getModel(key)?.color ?? "#888"} delay={i * 0.15} />
              ))}
            </div>
          ) : round1 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.values(round1).map((resp, i) => {
                  const model = getModel(resp.modelKey);
                  const color = model?.color ?? "#888";
                  const isActive = activeChatModel === resp.modelKey;
                  const extraMessages = (chatHistories[resp.modelKey] ?? []).slice(2);
                  const hasHistory = extraMessages.length > 0;
                  const isLoadingThis = chatLoading === resp.modelKey;

                  return (
                    <div
                      key={resp.modelKey}
                      className="animate-fade-up rounded-xl border overflow-hidden transition-all duration-300 flex flex-col"
                      style={{
                        borderColor: isActive ? color + "60" : color + "30",
                        background: "var(--bg-card)",
                        animationDelay: `${i * 0.1}s`,
                        boxShadow: isActive ? `0 0 24px ${color}15` : "none",
                      }}
                    >
                      {/* Card Header */}
                      <div className="px-5 py-4 border-b" style={{ borderColor: color + "15" }}>
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: color, boxShadow: `0 0 8px ${color}60` }}
                          />
                          <div>
                            <span className="font-semibold text-sm block" style={{ color }}>
                              {resp.modelName}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">
                              {model?.provider}
                            </span>
                          </div>
                          {resp.tokensUsed && (
                            <span className="ml-auto text-xs font-mono text-[var(--text-muted)]">
                              {resp.tokensUsed.toLocaleString()} tok
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Body — scrollable area with initial answer + chat messages */}
                      <div
                        className="px-5 py-4 overflow-y-auto chat-scroll-area flex-1 transition-all duration-300"
                        style={{ maxHeight: isActive ? "500px" : "400px" }}
                      >
                        {resp.error ? (
                          <div className="rounded-lg bg-red-500/5 border border-red-500/20 px-4 py-3">
                            <p className="text-red-400 text-sm font-mono">{resp.error}</p>
                          </div>
                        ) : (
                          <>
                            {/* Initial answer */}
                            <div className="prose-debate text-sm">
                              <ReactMarkdown>{resp.answer}</ReactMarkdown>
                            </div>

                            {/* Chat messages (follow-up Q&A) */}
                            {extraMessages.length > 0 && (
                              <div className="mt-4 pt-4 border-t space-y-2.5" style={{ borderColor: color + "20" }}>
                                <span className="text-[10px] font-mono tracking-wider uppercase" style={{ color: color + "80" }}>
                                  {t.followUpChat}
                                </span>
                                {extraMessages.map((msg, j) => (
                                  <div
                                    key={j}
                                    className={`text-sm rounded-lg px-3 py-2 ${
                                      msg.role === "user"
                                        ? "bg-[var(--bg-elevated)] ml-4 text-[var(--text-primary)]"
                                        : "mr-4 border"
                                    }`}
                                    style={msg.role === "assistant" ? { borderColor: color + "20" } : undefined}
                                  >
                                    {msg.role === "assistant" ? (
                                      <div className="prose-debate text-sm">
                                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                                      </div>
                                    ) : (
                                      <p>{msg.content}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Typing indicator */}
                            {isLoadingThis && (
                              <div className="mt-3 mr-4 border rounded-lg px-3 py-2" style={{ borderColor: color + "20" }}>
                                <TypingIndicator color={color} />
                              </div>
                            )}

                            {/* Scroll anchor */}
                            <div ref={(el) => { chatEndRefs.current[resp.modelKey] = el; }} />
                          </>
                        )}
                      </div>

                      {/* CTA / Chat Input Area */}
                      {!resp.error && (
                        <div className="px-5 pb-4 pt-2">
                          {isActive ? (
                            /* ── Inline Chat Input ── */
                            <div>
                              <div className="flex gap-2 items-end">
                                <textarea
                                  ref={(el) => { chatInputRefs.current[resp.modelKey] = el; }}
                                  value={getChatInput(resp.modelKey)}
                                  onChange={(e) => setChatInput(resp.modelKey, e.target.value)}
                                  placeholder={t.followUpPlaceholder}
                                  rows={1}
                                  className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border-dim)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-opacity-50 resize-none"
                                  style={{ minHeight: "40px", maxHeight: "80px" }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                                      e.preventDefault();
                                      sendChat(resp.modelKey);
                                    }
                                  }}
                                />
                                <button
                                  onClick={() => sendChat(resp.modelKey)}
                                  disabled={!getChatInput(resp.modelKey).trim() || !!chatLoading}
                                  className="shrink-0 rounded-lg px-3 py-2.5 text-xs font-bold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                  style={{ background: color, color: "#fff" }}
                                >
                                  {t.send}
                                </button>
                              </div>
                              <button
                                onClick={closeChat}
                                className="mt-2 text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer w-full text-center"
                              >
                                {t.close}
                              </button>
                            </div>
                          ) : (
                            /* ── CTA Button ── */
                            <button
                              onClick={() => openChat(resp.modelKey)}
                              className="w-full rounded-xl py-3 text-sm font-bold transition-all duration-300 cursor-pointer border"
                              style={
                                hasHistory
                                  ? {
                                      borderColor: color + "60",
                                      color: color,
                                      background: model?.glow ?? "transparent",
                                    }
                                  : {
                                      borderColor: color,
                                      color: "#fff",
                                      background: `linear-gradient(135deg, ${color}CC, ${color}AA)`,
                                      boxShadow: `0 4px 16px ${color}30`,
                                    }
                              }
                            >
                              {hasHistory ? t.continueChat : t.chatWithAI}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Tone / Format Selector */}
              <div
                className="mt-6 rounded-xl overflow-hidden"
                style={{
                  border: "1.5px solid #D4AF3740",
                  background: "linear-gradient(135deg, rgba(212,175,55,0.07) 0%, rgba(212,175,55,0.02) 100%)",
                  boxShadow: "0 0 24px rgba(212,175,55,0.06)",
                }}
              >
                <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b" style={{ borderColor: "#D4AF3720" }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: "#D4AF37", boxShadow: "0 0 6px #D4AF3780" }} />
                  <span className="text-sm font-bold" style={{ color: "#D4AF37" }}>
                    {t.toneLabel}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    — {locale === "ko" ? "최종 합성 답변의 스타일을 선택하세요" : "how should the final synthesis read?"}
                  </span>
                </div>
                <div className="px-5 pt-4 pb-3">
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {TONE_PRESETS.map((preset) => {
                      const isActive = toneInstruction === preset.instruction;
                      return (
                        <button
                          key={preset.id}
                          onClick={() => setToneInstruction(isActive ? "" : preset.instruction)}
                          className="rounded-lg px-4 py-3 text-sm font-semibold transition-all duration-200 cursor-pointer text-left"
                          style={{
                            border: `1.5px solid ${isActive ? "#D4AF37" : "var(--border-dim)"}`,
                            color: isActive ? "#D4AF37" : "var(--text-secondary)",
                            background: isActive ? "rgba(212,175,55,0.12)" : "var(--bg-elevated)",
                            boxShadow: isActive ? "0 0 14px rgba(212,175,55,0.18)" : "none",
                          }}
                        >
                          {preset.label[locale] ?? preset.label.en}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    value={toneInstruction}
                    onChange={(e) => setToneInstruction(e.target.value)}
                    placeholder={t.tonePlaceholder}
                    rows={2}
                    className="w-full rounded-lg px-3 py-2.5 text-sm placeholder-[var(--text-muted)] focus:outline-none transition-all resize-none"
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid #D4AF3730",
                      color: "var(--text-secondary)",
                    }}
                  />
                </div>
              </div>

              {/* Deep Analysis Button */}
              <div className="mt-3">
                <button
                  onClick={startDeepAnalysis}
                  className="w-full rounded-xl py-4 text-sm font-bold transition-all duration-300 cursor-pointer border-2"
                  style={{
                    borderColor: "#D4AF37",
                    color: "#fff",
                    background: "linear-gradient(135deg, #D4AF37CC, #D4AF37AA)",
                    boxShadow: "0 4px 16px rgba(212,175,55,0.3)",
                  }}
                >
                  {t.deepAnalysisButton}
                </button>
                <p className="text-center text-[10px] text-[var(--text-muted)] mt-2 font-mono">
                  {t.deepAnalysisDesc}
                </p>
              </div>
            </>
          ) : null}
        </main>
      )}

      {/* ═══════════════════ DEEP ANALYSIS VIEW ═══════════════════ */}
      {viewMode === "deep-analysis" && (
        <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 animate-fade-up">
          {/* Back Button */}
          <button
            onClick={() => setViewMode("compare")}
            className="text-sm font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer mb-6"
          >
            {t.backToComparison}
          </button>

          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Deep Analysis</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-8">
            {t.deepAnalysisSubtitle}
          </p>

          {/* Question Recap */}
          <div className="mb-6 bg-[var(--bg-card)] border border-[var(--border-dim)] rounded-xl px-6 py-4">
            <span className="text-xs font-mono text-[var(--text-muted)] tracking-wider uppercase">{t.question}</span>
            <p className="text-lg text-[var(--text-primary)] mt-1">{question}</p>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3 mb-8">
            <StepBadge num={1} label={t.stepCrossReview} active={deepStep === "review"} done={deepStep === "synthesis" || deepStep === "done"} />
            <div className="h-px flex-1" style={{ background: deepStep !== "idle" && deepStep !== "review" ? "linear-gradient(90deg, #3B82F6, #10B981)" : "var(--border-dim)" }} />
            <StepBadge num={2} label={t.stepSynthesis} active={deepStep === "synthesis"} done={deepStep === "done"} golden />
          </div>

          {/* Cross Review Results */}
          {(deepStep === "review" && deepLoading) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {selectedModels.map((key, i) => (
                <LoadingCard key={key} color={getModel(key)?.color ?? "#888"} delay={i * 0.15} />
              ))}
            </div>
          )}

          {round2 && (
            <div className="mb-8">
              <h3 className="text-sm font-mono text-[var(--text-secondary)] tracking-wider uppercase mb-4 flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)]" />
                {t.crossReview}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.values(round2).map((resp, i) => {
                  const color = getModel(resp.modelKey)?.color ?? "#888";
                  return (
                    <div
                      key={resp.modelKey}
                      className="animate-fade-up rounded-xl border overflow-hidden"
                      style={{
                        borderColor: color + "30",
                        background: "var(--bg-card)",
                        animationDelay: `${i * 0.1}s`,
                      }}
                    >
                      <div className="px-5 py-3 border-b" style={{ borderColor: color + "15" }}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                          <span className="font-semibold text-sm" style={{ color }}>{resp.modelName}</span>
                        </div>
                      </div>
                      <div className="px-5 py-4">
                        {resp.error ? (
                          <p className="text-red-400 text-sm">{resp.error}</p>
                        ) : (
                          <div className="prose-debate text-sm max-h-[400px] overflow-y-auto chat-scroll-area">
                            <ReactMarkdown>{resp.answer}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Synthesis Loading */}
          {deepStep === "synthesis" && deepLoading && (
            <LoadingCard color="#D4AF37" />
          )}

          {/* Synthesis Result */}
          {synthesis && (
            <div className="mt-4">
              <h3 className="text-sm font-mono text-[#D4AF37] tracking-wider uppercase mb-4 flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
                {t.finalSynthesis}
              </h3>
              <div
                className="animate-fade-up rounded-xl border px-6 py-5"
                style={{
                  borderColor: "#D4AF3744",
                  background: "linear-gradient(135deg, rgba(212,175,55,0.06) 0%, rgba(212,175,55,0.02) 100%)",
                  boxShadow: "0 0 40px rgba(212,175,55,0.06), inset 0 1px 0 rgba(212,175,55,0.1)",
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#D4AF37", boxShadow: "0 0 10px #D4AF3780" }} />
                  <span className="font-semibold text-[#D4AF37] text-sm">{synthesis.modelName}</span>
                  {synthesis.tokensUsed && (
                    <span className="ml-auto text-xs font-mono text-[var(--text-muted)]">
                      {synthesis.tokensUsed.toLocaleString()} tokens
                    </span>
                  )}
                </div>
                {synthesis.error ? (
                  <p className="text-red-400 text-sm">{synthesis.error}</p>
                ) : (
                  <>
                    <div className="prose-debate">
                      <ReactMarkdown>{synthesis.answer}</ReactMarkdown>
                    </div>

                    {/* Synthesis follow-up chat messages */}
                    {synthesisChatHistory.length > 2 && (
                      <div className="mt-5 pt-5 border-t space-y-3" style={{ borderColor: "#D4AF3730" }}>
                        <span className="text-[10px] font-mono tracking-wider uppercase text-[#D4AF3780]">
                          {t.followUpChat}
                        </span>
                        {synthesisChatHistory.slice(2).map((msg, j) => (
                          <div
                            key={j}
                            className={`text-sm rounded-lg px-3 py-2 ${
                              msg.role === "user"
                                ? "bg-[var(--bg-elevated)] ml-4 text-[var(--text-primary)]"
                                : "mr-4 border"
                            }`}
                            style={msg.role === "assistant" ? { borderColor: "#D4AF3720" } : undefined}
                          >
                            {msg.role === "assistant" ? (
                              <div className="prose-debate text-sm">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                              </div>
                            ) : (
                              <p>{msg.content}</p>
                            )}
                          </div>
                        ))}
                        {synthesisChatLoading && (
                          <div className="mr-4 border rounded-lg px-3 py-2" style={{ borderColor: "#D4AF3720" }}>
                            <TypingIndicator color="#D4AF37" />
                          </div>
                        )}
                        <div ref={synthesisChatEndRef} />
                      </div>
                    )}
                  </>
                )}

                {/* Synthesis Chat Input */}
                {!synthesis.error && (
                  <div className="mt-5 pt-4 border-t" style={{ borderColor: "#D4AF3720" }}>
                    {synthesisChatHistory.length === 0 && (
                      <button
                        onClick={initSynthesisChat}
                        className="w-full rounded-xl py-3 text-sm font-bold transition-all duration-300 cursor-pointer border-2"
                        style={{
                          borderColor: "#D4AF37",
                          color: "#fff",
                          background: "linear-gradient(135deg, #D4AF37CC, #D4AF37AA)",
                          boxShadow: "0 4px 16px rgba(212,175,55,0.3)",
                        }}
                      >
                        {t.chatWithSonnet}
                      </button>
                    )}
                    {synthesisChatHistory.length > 0 && (
                      <div className="flex gap-2 items-end">
                        <textarea
                          ref={synthesisChatInputRef}
                          value={synthesisChatInput}
                          onChange={(e) => setSynthesisChatInput(e.target.value)}
                          placeholder={t.synthesisPlaceholder}
                          rows={1}
                          className="flex-1 bg-[var(--bg-elevated)] border rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none resize-none"
                          style={{ borderColor: "#D4AF3730", minHeight: "40px", maxHeight: "80px" }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                              e.preventDefault();
                              sendSynthesisChat();
                            }
                          }}
                        />
                        <button
                          onClick={sendSynthesisChat}
                          disabled={!synthesisChatInput.trim() || synthesisChatLoading}
                          className="shrink-0 rounded-lg px-3 py-2.5 text-xs font-bold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{ background: "#D4AF37", color: "#fff" }}
                        >
                          {t.send}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      )}

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--border-dim)] px-6 py-4 mt-auto">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <span className="text-xs font-mono text-[var(--text-muted)]">
            AI Debate Arena v2.0
          </span>
          <span className="text-xs font-mono text-[var(--text-muted)]">
            3 providers · Compare → Choose → Chat
          </span>
        </div>
      </footer>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTimeAgo(timestamp: number, t: Translations): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t.justNow;
  if (mins < 60) return t.mAgo(mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t.hAgo(hours);
  return t.dAgo(Math.floor(hours / 24));
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function ApiKeyInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-mono uppercase tracking-wider text-[var(--text-secondary)]">
        {label}
      </span>
      <input
        type="password"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[#585878] transition-colors focus:border-blue-500/70 focus:outline-none"
      />
    </label>
  );
}

function StepBadge({ num, label, active, done, golden }: {
  num: number;
  label: string;
  active?: boolean;
  done?: boolean;
  golden?: boolean;
}) {
  const accentColor = golden ? "#D4AF37" : "#3B82F6";
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all duration-500 shrink-0"
        style={{
          background: done
            ? golden ? "#D4AF37" : "linear-gradient(135deg, #3B82F6, #10B981)"
            : active ? "var(--bg-elevated)" : "var(--bg-card)",
          border: active
            ? `2px solid ${accentColor}`
            : done ? "none" : "1px solid var(--border-dim)",
          color: done || active ? "#fff" : "var(--text-muted)",
        }}
      >
        {done ? "✓" : num}
      </div>
      <span
        className="text-xs font-mono tracking-wider uppercase hidden sm:inline"
        style={{
          color: active ? "var(--text-primary)" : done ? "var(--text-secondary)" : "var(--text-muted)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function LoadingCard({ color, delay = 0 }: { color: string; delay?: number }) {
  return (
    <div
      className="rounded-xl border overflow-hidden animate-pulse"
      style={{
        borderColor: color + "20",
        background: "var(--bg-card)",
        animationDelay: `${delay}s`,
      }}
    >
      <div className="px-5 py-4">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: color + "60" }} />
          <div className="h-3 rounded w-24" style={{ background: color + "15" }} />
        </div>
        <div className="space-y-2.5">
          <div className="h-3 rounded w-full bg-[var(--border-dim)]" />
          <div className="h-3 rounded w-5/6 bg-[var(--border-dim)]" />
          <div className="h-3 rounded w-4/6 bg-[var(--border-dim)]" />
          <div className="h-3 rounded w-3/6 bg-[var(--border-dim)]" />
        </div>
      </div>
    </div>
  );
}

function TypingIndicator({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
      <span className="inline-block w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: color }} />
      <span className="inline-block w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: color, animationDelay: "0.1s" }} />
      <span className="inline-block w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: color, animationDelay: "0.2s" }} />
    </div>
  );
}
