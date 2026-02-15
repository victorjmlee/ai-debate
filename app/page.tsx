"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

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

type ViewMode = "input" | "compare" | "deep-analysis";

// ─── Component ───────────────────────────────────────────────────────────────

export default function DebateArena() {
  const [viewMode, setViewMode] = useState<ViewMode>("input");
  const [question, setQuestion] = useState("");
  const [availableModels, setAvailableModels] = useState<Record<string, boolean> | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Session history
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const nextSessionId = useRef(1);

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

  // Synthesis chat
  const [synthesisChatHistory, setSynthesisChatHistory] = useState<ChatMessage[]>([]);
  const [synthesisChatInput, setSynthesisChatInput] = useState("");
  const [synthesisChatLoading, setSynthesisChatLoading] = useState(false);
  const synthesisChatEndRef = useRef<HTMLDivElement>(null);
  const synthesisChatInputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch available models
  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        setAvailableModels(data.available);
        const keys = Object.entries(data.available as Record<string, boolean>)
          .filter(([, v]) => v)
          .map(([k]) => k);
        setSelectedModels(keys);
      })
      .catch(() => setAvailableModels({}));
  }, []);

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

  // ─── Compare Flow ──────────────────────────────────────────────────────────

  const startCompare = async () => {
    if (!question.trim() || selectedModels.length === 0) return;
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
        body: JSON.stringify({ question, models: selectedModels, round: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "요청 실패");
      if (data.responses) setRound1(data.responses);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "알 수 없는 에러";
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
        body: JSON.stringify({ model: modelKey, messages: updatedHistory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "요청 실패");

      setChatHistories((prev) => ({
        ...prev,
        [modelKey]: [...(prev[modelKey] ?? []), { role: "assistant", content: data.response?.answer ?? "" }],
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "알 수 없는 에러";
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
      { role: "user", content: `다음은 여러 AI의 답변을 종합 분석한 결과입니다:\n\n${synthesis.answer}` },
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
        body: JSON.stringify({ model: "synthesis", messages: updatedHistory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "요청 실패");

      setSynthesisChatHistory((prev) => [
        ...prev,
        { role: "assistant", content: data.response?.answer ?? "" },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "알 수 없는 에러";
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

    // 추가 대화 내역이 있으면 초기 답변에 합쳐서 전달
    const enrichedResponses: Record<string, ModelResponse> = {};
    for (const [key, resp] of Object.entries(round1)) {
      const extra = (chatHistories[key] ?? []).slice(2);
      if (extra.length > 0) {
        const chatSummary = extra
          .map((msg) => msg.role === "user" ? `[추가 질문] ${msg.content}` : `[추가 답변] ${msg.content}`)
          .join("\n\n");
        enrichedResponses[key] = {
          ...resp,
          answer: `${resp.answer}\n\n--- 추가 대화 ---\n\n${chatSummary}`,
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
          previousResponses: enrichedResponses,
        }),
      });
      const data2 = await res2.json();
      if (!res2.ok) throw new Error(data2.error || "요청 실패");
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
          previousResponses: data2.responses,
        }),
      });
      const data3 = await res3.json();
      if (!res3.ok) throw new Error(data3.error || "요청 실패");
      if (data3.synthesis) setSynthesis(data3.synthesis);
      setDeepStep("done");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "알 수 없는 에러";
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
    <div className="relative z-10 min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-[var(--border-dim)] px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
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
          <div className="flex items-center gap-3">
            {viewMode !== "input" && (
              <button
                onClick={startNew}
                className="text-sm font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg px-4 py-2 transition-all hover:border-[var(--text-muted)] cursor-pointer"
              >
                + New
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ═══════════════════ INPUT VIEW ═══════════════════ */}
      {viewMode === "input" && (
        <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12 animate-fade-up">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-3">
              어떤 AI가 가장 잘 답할까?
            </h2>
            <p className="text-[var(--text-secondary)] text-lg">
              3개 AI를 동시에 비교하고, 마음에 드는 AI와 대화를 이어가세요
            </p>
          </div>

          {/* Question */}
          <div className="mb-8">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="AI에게 물어볼 질문을 입력하세요..."
              rows={4}
              className="w-full bg-[var(--bg-card)] border border-[var(--border-dim)] rounded-xl px-5 py-4 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none text-lg"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) startCompare();
              }}
            />
          </div>

          {/* Model Selector */}
          <div className="mb-8">
            <label className="block text-sm font-mono text-[var(--text-muted)] mb-4 tracking-wider uppercase">
              Models
            </label>
            <div className="grid grid-cols-3 gap-3">
              {MODELS.map((model) => {
                const isAvailable = availableModels?.[model.key] ?? false;
                const selected = selectedModels.includes(model.key);
                return (
                  <button
                    key={model.key}
                    onClick={() => toggleModel(model.key)}
                    disabled={!isAvailable}
                    className="group relative rounded-xl border px-4 py-3.5 text-left transition-all duration-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      borderColor: selected ? model.color + "55" : "var(--border-dim)",
                      background: selected ? model.glow : "var(--bg-card)",
                      boxShadow: selected ? `0 0 20px ${model.color}10` : "none",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full transition-all duration-300"
                        style={{
                          background: selected ? model.color : "var(--border-subtle)",
                          boxShadow: selected ? `0 0 8px ${model.color}80` : "none",
                        }}
                      />
                      <div>
                        <span
                          className="text-sm font-semibold transition-colors block"
                          style={{ color: selected ? model.color : "var(--text-secondary)" }}
                        >
                          {model.name}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--text-muted)]">
                          {model.provider}
                        </span>
                      </div>
                    </div>
                    {!isAvailable && (
                      <span className="text-[10px] font-mono text-[var(--text-muted)] mt-1 block">
                        No API key
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {availableModels && Object.values(availableModels).every((v) => !v) && (
              <p className="text-sm text-red-400 mt-3 font-mono">
                No API keys configured. Add them in Vercel → Settings → Environment Variables.
              </p>
            )}
          </div>

          {/* Start Button */}
          <button
            onClick={startCompare}
            disabled={!question.trim() || selectedModels.length === 0}
            className="w-full relative overflow-hidden rounded-xl py-4 text-base font-bold tracking-wide transition-all duration-300 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg, #3B82F6 0%, #10B981 50%, #F59E0B 100%)",
            }}
          >
            <span className="relative z-10 text-white drop-shadow-sm">
              Compare AI Responses →
            </span>
          </button>
          <p className="text-center text-xs text-[var(--text-muted)] mt-3 font-mono">
            ⌘ + Enter
          </p>

          {/* Session History */}
          {sessions.length > 0 && (
            <div className="mt-12 pt-8 border-t border-[var(--border-dim)]">
              <h3 className="text-sm font-mono text-[var(--text-muted)] tracking-wider uppercase mb-4">
                이전 대화
              </h3>
              <div className="space-y-2.5">
                {sessions.map((session) => {
                  const modelCount = session.selectedModels.length;
                  const chatCount = Object.values(session.chatHistories)
                    .reduce((sum, h) => sum + Math.max(0, h.length - 2), 0);
                  const hasDeep = session.deepStep === "done";
                  const timeAgo = getTimeAgo(session.timestamp);
                  return (
                    <div
                      key={session.id}
                      className="group flex items-center gap-3 bg-[var(--bg-card)] border border-[var(--border-dim)] rounded-xl px-4 py-3.5 hover:border-[var(--border-subtle)] transition-all cursor-pointer"
                      onClick={() => restoreSession(session)}
                    >
                      {/* Model dots */}
                      <div className="flex -space-x-1 shrink-0">
                        {session.selectedModels.map((key) => {
                          const m = getModel(key);
                          return (
                            <div
                              key={key}
                              className="w-2.5 h-2.5 rounded-full border border-[var(--bg-card)]"
                              style={{ background: m?.color ?? "#888" }}
                            />
                          );
                        })}
                      </div>
                      {/* Question text */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-primary)] truncate">
                          {session.question}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">
                            {modelCount} models
                          </span>
                          {chatCount > 0 && (
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">
                              · {chatCount} follow-ups
                            </span>
                          )}
                          {hasDeep && (
                            <span className="text-[10px] font-mono text-[#D4AF37]">
                              · Deep Analysis
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">
                            · {timeAgo}
                          </span>
                        </div>
                      </div>
                      {/* Delete button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                        className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-all text-xs cursor-pointer shrink-0 px-1"
                        title="삭제"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      )}

      {/* ═══════════════════ COMPARE VIEW ═══════════════════ */}
      {viewMode === "compare" && (
        <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 animate-fade-up">
          {/* Question Display */}
          <div className="mb-6 bg-[var(--bg-card)] border border-[var(--border-dim)] rounded-xl px-6 py-4">
            <span className="text-xs font-mono text-[var(--text-muted)] tracking-wider uppercase">
              Question
            </span>
            <p className="text-lg text-[var(--text-primary)] mt-1">{question}</p>
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
                                  후속 대화
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
                                  placeholder="후속 질문..."
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
                                  Send
                                </button>
                              </div>
                              <button
                                onClick={closeChat}
                                className="mt-2 text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer w-full text-center"
                              >
                                닫기
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
                              {hasHistory ? "대화 이어가기 →" : "이 AI와 대화하기 →"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Deep Analysis Button */}
              <div className="mt-6">
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
                  Deep Analysis — 모델 간 교차 리뷰 & 종합 →
                </button>
                <p className="text-center text-[10px] text-[var(--text-muted)] mt-2 font-mono">
                  각 AI가 서로의 답변을 검토하고, 최종 종합 분석을 생성합니다
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
            ← 비교로 돌아가기
          </button>

          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Deep Analysis</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-8">
            각 AI가 다른 AI의 답변을 리뷰하고, 모든 인사이트를 종합합니다
          </p>

          {/* Question Recap */}
          <div className="mb-6 bg-[var(--bg-card)] border border-[var(--border-dim)] rounded-xl px-6 py-4">
            <span className="text-xs font-mono text-[var(--text-muted)] tracking-wider uppercase">Question</span>
            <p className="text-lg text-[var(--text-primary)] mt-1">{question}</p>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3 mb-8">
            <StepBadge num={1} label="Cross Review" active={deepStep === "review"} done={deepStep === "synthesis" || deepStep === "done"} />
            <div className="h-px flex-1" style={{ background: deepStep !== "idle" && deepStep !== "review" ? "linear-gradient(90deg, #3B82F6, #10B981)" : "var(--border-dim)" }} />
            <StepBadge num={2} label="Synthesis" active={deepStep === "synthesis"} done={deepStep === "done"} golden />
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
                Cross Review
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
                Final Synthesis
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
                          후속 대화
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
                        Sonnet과 대화하기 →
                      </button>
                    )}
                    {synthesisChatHistory.length > 0 && (
                      <div className="flex gap-2 items-end">
                        <textarea
                          ref={synthesisChatInputRef}
                          value={synthesisChatInput}
                          onChange={(e) => setSynthesisChatInput(e.target.value)}
                          placeholder="종합 분석에 대해 추가 질문..."
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
                          Send
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
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

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
