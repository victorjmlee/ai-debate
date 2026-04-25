// ─── Model Configuration ─────────────────────────────────────────────────────

export interface ModelConfig {
  key: string;
  apiModel: string;
  displayName: string;
  provider: string;
  color: string;
  glow: string;
}

export interface ModelOption {
  apiModel: string;
  displayName: string;
  webSearch: boolean;
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
    apiModel: process.env.MODEL_GPT ?? "gpt-5.4-mini",
    displayName: "GPT-5.4 Mini",
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

export const PROVIDER_MODEL_OPTIONS: Record<string, ModelOption[]> = {
  "claude-haiku": [
    { apiModel: "claude-opus-4-7",   displayName: "Opus 4.7",   webSearch: true },
    { apiModel: "claude-sonnet-4-6", displayName: "Sonnet 4.6", webSearch: true },
    { apiModel: "claude-haiku-4-5",  displayName: "Haiku 4.5",  webSearch: true },
  ],
  "gpt-5-mini": [
    { apiModel: "gpt-5.5",      displayName: "GPT-5.5",      webSearch: false },
    { apiModel: "gpt-5.4",      displayName: "GPT-5.4",      webSearch: false },
    { apiModel: "gpt-5.4-mini", displayName: "GPT-5.4 Mini", webSearch: false },
  ],
  "gemini": [
    { apiModel: "gemini-2.5-pro",       displayName: "2.5 Pro",        webSearch: true },
    { apiModel: "gemini-2.5-flash",     displayName: "2.5 Flash",      webSearch: true },
    { apiModel: "gemini-2.5-flash-lite",displayName: "2.5 Flash Lite", webSearch: true },
  ],
};

export const SYNTHESIS_MODEL = {
  key: "synthesis",
  apiModel: process.env.MODEL_SYNTHESIS ?? "claude-sonnet-4-6",
  displayName: "Claude Sonnet 4.6",
  provider: "Anthropic",
};

export function getModelConfig(key: string): ModelConfig | undefined {
  return COMPARE_MODELS.find((m) => m.key === key);
}

export function getApiModel(key: string, overrides?: Record<string, string>): string {
  return overrides?.[key] ?? getModelConfig(key)?.apiModel ?? key;
}

export function getDisplayName(key: string, overrides?: Record<string, string>): string {
  const override = overrides?.[key];
  if (override) {
    const option = PROVIDER_MODEL_OPTIONS[key]?.find((o) => o.apiModel === override);
    if (option) return option.displayName;
  }
  return getModelConfig(key)?.displayName ?? key;
}

export function modelSupportsWebSearch(key: string, overrides?: Record<string, string>): boolean {
  const apiModel = getApiModel(key, overrides);
  const option = PROVIDER_MODEL_OPTIONS[key]?.find((o) => o.apiModel === apiModel);
  return option?.webSearch ?? true;
}
