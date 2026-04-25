import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ModelResponse {
  modelKey: string;
  modelName: string;
  answer: string;
  error?: string;
  tokensUsed?: number;
}

export interface ApiKeys {
  anthropic?: string;
  openai?: string;
  google?: string;
}

export interface ApiClients {
  anthropicClient: Anthropic | null;
  openaiClient: OpenAI | null;
  geminiClient: GoogleGenAI | null;
}

// ─── Request-Scoped Clients ─────────────────────────────────────────────────

function cleanKey(key?: string) {
  const trimmed = key?.trim();
  return trimmed || undefined;
}

export function resolveApiKeys(apiKeys?: ApiKeys): Required<ApiKeys> {
  return {
    anthropic: cleanKey(apiKeys?.anthropic) ?? process.env.ANTHROPIC_API_KEY ?? "",
    openai: cleanKey(apiKeys?.openai) ?? process.env.OPENAI_API_KEY ?? "",
    google: cleanKey(apiKeys?.google) ?? process.env.GOOGLE_API_KEY ?? "",
  };
}

export function createApiClients(apiKeys?: ApiKeys): ApiClients {
  const resolved = resolveApiKeys(apiKeys);

  return {
    anthropicClient: resolved.anthropic ? new Anthropic({ apiKey: resolved.anthropic }) : null,
    openaiClient: resolved.openai ? new OpenAI({ apiKey: resolved.openai }) : null,
    geminiClient: resolved.google ? new GoogleGenAI({ apiKey: resolved.google }) : null,
  };
}

export function getAvailableModels(apiKeys?: ApiKeys) {
  const resolved = resolveApiKeys(apiKeys);

  return {
    "claude-haiku": Boolean(resolved.anthropic),
    "gpt-5-mini": Boolean(resolved.openai),
    gemini: Boolean(resolved.google),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extract all text blocks from an Anthropic response (skips web search tool blocks). */
export function extractAnthropicText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}
