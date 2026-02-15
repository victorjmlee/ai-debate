// ─── Model Configuration ─────────────────────────────────────────────────────
// Defaults use provider aliases (no date suffix) so they auto-resolve to the
// latest snapshot.  Override via env vars to pin a specific version:
//
// .env.local:
//   MODEL_CLAUDE_HAIKU=claude-haiku-4-5-20251001   # pin specific snapshot
//   MODEL_GPT=gpt-5-mini-2025-08-07
//   MODEL_GEMINI=gemini-2.5-flash
//   MODEL_SYNTHESIS=claude-sonnet-4-5-20250929

export interface ModelConfig {
  key: string;
  apiModel: string;       // actual model ID sent to API
  displayName: string;
  provider: string;
  color: string;
  glow: string;
}

export const COMPARE_MODELS: ModelConfig[] = [
  {
    key: "claude-haiku",
    apiModel: process.env.MODEL_CLAUDE_HAIKU ?? "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    provider: "Anthropic",
    color: "#3B82F6",
    glow: "rgba(59,130,246,0.15)",
  },
  {
    key: "gpt-5-mini",
    apiModel: process.env.MODEL_GPT ?? "gpt-5-mini",
    displayName: "GPT-5 Mini",
    provider: "OpenAI",
    color: "#10B981",
    glow: "rgba(16,185,129,0.15)",
  },
  {
    key: "gemini",
    apiModel: process.env.MODEL_GEMINI ?? "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    provider: "Google",
    color: "#F59E0B",
    glow: "rgba(245,158,11,0.15)",
  },
];

export const SYNTHESIS_MODEL = {
  key: "synthesis",
  apiModel: process.env.MODEL_SYNTHESIS ?? "claude-sonnet-4-5",
  displayName: "Claude Sonnet 4.5",
  provider: "Anthropic",
};

export function getModelConfig(key: string): ModelConfig | undefined {
  return COMPARE_MODELS.find((m) => m.key === key);
}

export function getApiModel(key: string): string {
  return getModelConfig(key)?.apiModel ?? key;
}

export function getDisplayName(key: string): string {
  return getModelConfig(key)?.displayName ?? key;
}
