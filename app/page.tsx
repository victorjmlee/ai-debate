"use client";

import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ModelResponse {
  modelKey: string;
  modelName: string;
  answer: string;
  error?: string;
  tokensUsed?: number;
}

interface ModelOption {
  key: string;
  name: string;
  color: string;
  glow: string;
}

const MODELS: ModelOption[] = [
  { key: "claude-sonnet", name: "Claude Sonnet", color: "#3B82F6", glow: "rgba(59,130,246,0.15)" },
  { key: "claude-opus", name: "Claude Opus", color: "#06B6D4", glow: "rgba(6,182,212,0.15)" },
  { key: "gpt-4o", name: "GPT-4o", color: "#10B981", glow: "rgba(16,185,129,0.15)" },
  { key: "gemini", name: "Gemini 2.0 Flash", color: "#F59E0B", glow: "rgba(245,158,11,0.15)" },
];

const ROUND_LABELS = ["Initial Answers", "Cross Review", "Synthesis"];

// ─── Component ───────────────────────────────────────────────────────────────

export default function DebateArena() {
  const [question, setQuestion] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>(
    MODELS.map((m) => m.key)
  );
  const [currentRound, setCurrentRound] = useState(0); // 0 = not started
  const [loading, setLoading] = useState(false);
  const [round1, setRound1] = useState<Record<string, ModelResponse> | null>(null);
  const [round2, setRound2] = useState<Record<string, ModelResponse> | null>(null);
  const [synthesis, setSynthesis] = useState<ModelResponse | null>(null);

  const toggleModel = (key: string) => {
    setSelectedModels((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const fetchRound = useCallback(
    async (
      round: 1 | 2 | 3,
      previousResponses?: Record<string, ModelResponse>
    ) => {
      setLoading(true);
      try {
        const res = await fetch("/api/debate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            models: selectedModels,
            round,
            previousResponses,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "요청 실패");
        return data;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "알 수 없는 에러";
        alert(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [question, selectedModels]
  );

  const startDebate = async () => {
    if (!question.trim() || selectedModels.length === 0) return;
    setRound1(null);
    setRound2(null);
    setSynthesis(null);
    setCurrentRound(1);
    const data = await fetchRound(1);
    if (data?.responses) setRound1(data.responses);
  };

  const continueToReview = async () => {
    if (!round1) return;
    setCurrentRound(2);
    const data = await fetchRound(2, round1);
    if (data?.responses) setRound2(data.responses);
  };

  const generateSynthesis = async () => {
    if (!round2) return;
    setCurrentRound(3);
    const data = await fetchRound(3, round2);
    if (data?.synthesis) setSynthesis(data.synthesis);
  };

  const resetDebate = () => {
    setCurrentRound(0);
    setRound1(null);
    setRound2(null);
    setSynthesis(null);
    setQuestion("");
  };

  const getModelColor = (key: string) =>
    MODELS.find((m) => m.key === key)?.color ?? "#888";

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-[var(--border-dim)] px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-blue-400 via-emerald-400 to-amber-400 bg-clip-text text-transparent">
                AI Debate Arena
              </span>
            </h1>
            <p className="text-xs font-mono text-[var(--text-muted)] mt-1 tracking-widest uppercase">
              Claude · GPT-4o · Gemini
            </p>
          </div>
          {currentRound > 0 && (
            <button
              onClick={resetDebate}
              className="text-sm font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg px-4 py-2 transition-all hover:border-[var(--text-muted)] cursor-pointer"
            >
              ← New Debate
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {/* ── Input Section (visible when not started) ── */}
        {currentRound === 0 && (
          <div className="animate-fade-up">
            {/* Question */}
            <div className="mb-8">
              <label className="block text-sm font-mono text-[var(--text-muted)] mb-3 tracking-wider uppercase">
                Question
              </label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="AI에게 물어볼 질문을 입력하세요..."
                rows={4}
                className="w-full bg-[var(--bg-card)] border border-[var(--border-dim)] rounded-xl px-5 py-4 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all resize-none text-lg"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) startDebate();
                }}
              />
            </div>

            {/* Model Selector */}
            <div className="mb-8">
              <label className="block text-sm font-mono text-[var(--text-muted)] mb-4 tracking-wider uppercase">
                Models
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {MODELS.map((model) => {
                  const selected = selectedModels.includes(model.key);
                  return (
                    <button
                      key={model.key}
                      onClick={() => toggleModel(model.key)}
                      className="group relative rounded-xl border px-4 py-3.5 text-left transition-all duration-300 cursor-pointer"
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
                        <span
                          className="text-sm font-semibold transition-colors"
                          style={{ color: selected ? model.color : "var(--text-secondary)" }}
                        >
                          {model.name}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={startDebate}
              disabled={!question.trim() || selectedModels.length === 0}
              className="w-full relative overflow-hidden rounded-xl py-4 text-base font-bold tracking-wide transition-all duration-300 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #3B82F6 0%, #10B981 50%, #F59E0B 100%)",
              }}
            >
              <span className="relative z-10 text-white drop-shadow-sm">
                Start Debate →
              </span>
            </button>
            <p className="text-center text-xs text-[var(--text-muted)] mt-3 font-mono">
              ⌘ + Enter to start
            </p>
          </div>
        )}

        {/* ── Debate In Progress ── */}
        {currentRound > 0 && (
          <div className="animate-fade-up">
            {/* Question Display */}
            <div className="mb-8 bg-[var(--bg-card)] border border-[var(--border-dim)] rounded-xl px-6 py-4">
              <span className="text-xs font-mono text-[var(--text-muted)] tracking-wider uppercase">
                Question
              </span>
              <p className="text-lg text-[var(--text-primary)] mt-1">{question}</p>
            </div>

            {/* Step Indicator */}
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-3">
                {ROUND_LABELS.map((label, i) => {
                  const roundNum = i + 1;
                  const isActive = currentRound === roundNum;
                  const isCompleted = currentRound > roundNum;
                  return (
                    <div key={label} className="flex items-center gap-2 flex-1">
                      <div className="flex items-center gap-2 flex-1">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all duration-500 shrink-0"
                          style={{
                            background: isCompleted
                              ? "linear-gradient(135deg, #3B82F6, #10B981)"
                              : isActive
                              ? "var(--bg-elevated)"
                              : "var(--bg-card)",
                            border: isActive
                              ? "2px solid #3B82F6"
                              : isCompleted
                              ? "none"
                              : "1px solid var(--border-dim)",
                            color: isCompleted || isActive
                              ? "#fff"
                              : "var(--text-muted)",
                          }}
                        >
                          {isCompleted ? "✓" : roundNum}
                        </div>
                        <span
                          className="text-xs font-mono tracking-wider uppercase transition-colors hidden sm:inline"
                          style={{
                            color: isActive
                              ? "var(--text-primary)"
                              : isCompleted
                              ? "var(--text-secondary)"
                              : "var(--text-muted)",
                          }}
                        >
                          {label}
                        </span>
                      </div>
                      {i < 2 && (
                        <div
                          className="h-px flex-1 transition-colors duration-500 min-w-[20px]"
                          style={{
                            background: isCompleted
                              ? "linear-gradient(90deg, #3B82F6, #10B981)"
                              : "var(--border-dim)",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Round 1 Results */}
            {currentRound >= 1 && (
              <RoundSection
                title="Round 1 — Initial Answers"
                responses={round1}
                loading={loading && currentRound === 1}
                getColor={getModelColor}
              />
            )}

            {/* Continue Button */}
            {round1 && currentRound === 1 && !loading && (
              <ActionButton
                onClick={continueToReview}
                label="Continue to Cross Review"
                sublabel="Each model reviews the others' answers"
              />
            )}

            {/* Round 2 Results */}
            {currentRound >= 2 && (
              <RoundSection
                title="Round 2 — Cross Review"
                responses={round2}
                loading={loading && currentRound === 2}
                getColor={getModelColor}
              />
            )}

            {/* Synthesize Button */}
            {round2 && currentRound === 2 && !loading && (
              <ActionButton
                onClick={generateSynthesis}
                label="Generate Synthesis"
                sublabel="Combine all insights into one final answer"
                golden
              />
            )}

            {/* Round 3 — Synthesis */}
            {currentRound >= 3 && (
              <div className="mt-10" style={{ animationDelay: "0.1s" }}>
                <h3 className="text-sm font-mono text-[#D4AF37] tracking-wider uppercase mb-4 flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
                  Final Synthesis
                </h3>
                {loading && currentRound === 3 ? (
                  <LoadingCard color="#D4AF37" />
                ) : synthesis ? (
                  <div
                    className="animate-fade-up rounded-xl border px-6 py-5 transition-all"
                    style={{
                      borderColor: "#D4AF3744",
                      background: "linear-gradient(135deg, rgba(212,175,55,0.06) 0%, rgba(212,175,55,0.02) 100%)",
                      boxShadow: "0 0 40px rgba(212,175,55,0.06), inset 0 1px 0 rgba(212,175,55,0.1)",
                    }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{
                          background: "#D4AF37",
                          boxShadow: "0 0 10px #D4AF3780",
                        }}
                      />
                      <span className="font-semibold text-[#D4AF37] text-sm">
                        {synthesis.modelName}
                      </span>
                      {synthesis.tokensUsed && (
                        <span className="ml-auto text-xs font-mono text-[var(--text-muted)]">
                          {synthesis.tokensUsed.toLocaleString()} tokens
                        </span>
                      )}
                    </div>
                    {synthesis.error ? (
                      <p className="text-red-400 text-sm">{synthesis.error}</p>
                    ) : (
                      <div className="prose-debate">
                        <ReactMarkdown>{synthesis.answer}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Final — New Debate */}
            {synthesis && !loading && (
              <div className="mt-10 text-center animate-fade-up" style={{ animationDelay: "0.3s" }}>
                <button
                  onClick={resetDebate}
                  className="text-sm font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg px-6 py-3 transition-all hover:border-[var(--text-muted)] cursor-pointer"
                >
                  ← Start New Debate
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--border-dim)] px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <span className="text-xs font-mono text-[var(--text-muted)]">
            AI Debate Arena v1.0
          </span>
          <span className="text-xs font-mono text-[var(--text-muted)]">
            Responses may vary · API keys required
          </span>
        </div>
      </footer>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function RoundSection({
  title,
  responses,
  loading,
  getColor,
}: {
  title: string;
  responses: Record<string, ModelResponse> | null;
  loading: boolean;
  getColor: (key: string) => string;
}) {
  return (
    <div className="mt-8">
      <h3 className="text-sm font-mono text-[var(--text-secondary)] tracking-wider uppercase mb-4 flex items-center gap-2">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--text-secondary)" }}
        />
        {title}
      </h3>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <LoadingCard key={i} color="#3B82F6" delay={i * 0.15} />
          ))}
        </div>
      ) : responses ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.values(responses).map((resp, i) => (
            <ResponseCard
              key={resp.modelKey}
              response={resp}
              color={getColor(resp.modelKey)}
              delay={i * 0.1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ResponseCard({
  response,
  color,
  delay = 0,
}: {
  response: ModelResponse;
  color: string;
  delay?: number;
}) {
  return (
    <div
      className="animate-fade-up rounded-xl border overflow-hidden transition-all hover:border-opacity-60"
      style={{
        borderColor: color + "30",
        background: "var(--bg-card)",
        animationDelay: `${delay}s`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className="px-5 py-4">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: color, boxShadow: `0 0 8px ${color}60` }}
          />
          <span className="font-semibold text-sm" style={{ color }}>
            {response.modelName}
          </span>
          {response.tokensUsed && (
            <span className="ml-auto text-xs font-mono text-[var(--text-muted)]">
              {response.tokensUsed.toLocaleString()} tok
            </span>
          )}
        </div>

        {/* Content */}
        {response.error ? (
          <div className="rounded-lg bg-red-500/5 border border-red-500/20 px-4 py-3">
            <p className="text-red-400 text-sm font-mono">{response.error}</p>
          </div>
        ) : (
          <div className="prose-debate text-sm max-h-[400px] overflow-y-auto pr-2">
            <ReactMarkdown>{response.answer}</ReactMarkdown>
          </div>
        )}
      </div>
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
        borderLeft: `3px solid ${color}40`,
      }}
    >
      <div className="px-5 py-4">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: color + "60" }}
          />
          <div
            className="h-3 rounded w-24"
            style={{ background: color + "15" }}
          />
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

function ActionButton({
  onClick,
  label,
  sublabel,
  golden,
}: {
  onClick: () => void;
  label: string;
  sublabel: string;
  golden?: boolean;
}) {
  return (
    <div className="mt-8 text-center animate-fade-up" style={{ animationDelay: "0.2s" }}>
      <button
        onClick={onClick}
        className="group relative overflow-hidden rounded-xl px-8 py-4 font-bold text-sm tracking-wide transition-all duration-300 cursor-pointer border"
        style={{
          borderColor: golden ? "#D4AF3744" : "var(--border-subtle)",
          background: golden
            ? "linear-gradient(135deg, rgba(212,175,55,0.1), rgba(212,175,55,0.05))"
            : "var(--bg-elevated)",
          color: golden ? "#D4AF37" : "var(--text-primary)",
        }}
      >
        <span className="relative z-10">{label} →</span>
      </button>
      <p className="text-xs text-[var(--text-muted)] mt-2 font-mono">{sublabel}</p>
    </div>
  );
}
