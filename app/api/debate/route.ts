import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getApiModel, getDisplayName, modelSupportsWebSearch, SYNTHESIS_MODEL } from "@/app/config/models";
import {
  createApiClients,
  extractAnthropicText,
  type ApiClients,
  type ApiKeys,
  type ModelResponse,
} from "@/app/lib/ai-clients";
import { getTranslations, type Locale } from "@/app/i18n/translations";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DebateRequest {
  question: string;
  models: string[];
  round: 1 | 2 | 3;
  locale?: Locale;
  apiKeys?: ApiKeys;
  modelOverrides?: Record<string, string>;
  previousResponses?: Record<string, ModelResponse>;
  toneInstruction?: string;
}

// ─── Web-search-enabled tool configs ────────────────────────────────────────

const ANTHROPIC_TOOLS_BASIC: Anthropic.Messages.ToolUnion[] = [
  { type: "web_search_20250305", name: "web_search", max_uses: 3 },
];

const GEMINI_SEARCH_CONFIG = {
  tools: [{ googleSearch: {} }],
};

// ─── Model Callers ───────────────────────────────────────────────────────────

async function askAnthropic(
  modelKey: string,
  prompt: string,
  clients: ApiClients,
  overrides?: Record<string, string>
): Promise<ModelResponse> {
  const name = getDisplayName(modelKey, overrides);
  if (!clients.anthropicClient)
    return { modelKey, modelName: name, answer: "", error: "API key missing" };

  try {
    const response = await clients.anthropicClient.messages.create({
      model: getApiModel(modelKey, overrides),
      max_tokens: 4000,
      tools: ANTHROPIC_TOOLS_BASIC,
      messages: [{ role: "user", content: prompt }],
    });
    return {
      modelKey,
      modelName: name,
      answer: extractAnthropicText(response.content),
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { modelKey, modelName: name, answer: "", error: msg };
  }
}

async function askOpenAI(
  modelKey: string,
  prompt: string,
  clients: ApiClients,
  overrides?: Record<string, string>
): Promise<ModelResponse> {
  const name = getDisplayName(modelKey, overrides);
  if (!clients.openaiClient)
    return { modelKey, modelName: name, answer: "", error: "API key missing" };

  try {
    const supportsSearch = modelSupportsWebSearch(modelKey, overrides);
    const response = await clients.openaiClient.chat.completions.create({
      model: getApiModel(modelKey, overrides),
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 4000,
      ...(supportsSearch ? { web_search_options: {} } : {}),
    });
    return {
      modelKey,
      modelName: name,
      answer: response.choices[0]?.message?.content ?? "",
      tokensUsed: response.usage?.total_tokens,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { modelKey, modelName: name, answer: "", error: msg };
  }
}

async function askGemini(
  modelKey: string,
  prompt: string,
  clients: ApiClients,
  overrides?: Record<string, string>
): Promise<ModelResponse> {
  const name = getDisplayName(modelKey, overrides);
  if (!clients.geminiClient)
    return { modelKey, modelName: name, answer: "", error: "API key missing" };

  try {
    const response = await clients.geminiClient.models.generateContent({
      model: getApiModel(modelKey, overrides),
      contents: prompt,
      config: GEMINI_SEARCH_CONFIG,
    });
    return {
      modelKey,
      modelName: name,
      answer: response.text ?? "",
      tokensUsed: response.usageMetadata?.totalTokenCount,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { modelKey, modelName: name, answer: "", error: msg };
  }
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

async function askModel(
  modelKey: string,
  prompt: string,
  clients: ApiClients,
  overrides?: Record<string, string>
): Promise<ModelResponse> {
  switch (modelKey) {
    case "claude-haiku":
      return askAnthropic(modelKey, prompt, clients, overrides);
    case "gpt-5-mini":
      return askOpenAI(modelKey, prompt, clients, overrides);
    case "gemini":
      return askGemini(modelKey, prompt, clients, overrides);
    default:
      return { modelKey, modelName: modelKey, answer: "", error: "Unknown model" };
  }
}

async function askSynthesisModel(prompt: string, clients: ApiClients): Promise<ModelResponse> {
  if (!clients.anthropicClient) {
    return askOpenAI("gpt-5-mini", prompt, clients);
  }

  try {
    const response = await clients.anthropicClient.messages.create({
      model: SYNTHESIS_MODEL.apiModel,
      max_tokens: 4000,
      tools: ANTHROPIC_TOOLS_BASIC,
      messages: [{ role: "user", content: prompt }],
    });
    return {
      modelKey: SYNTHESIS_MODEL.key,
      modelName: SYNTHESIS_MODEL.displayName,
      answer: extractAnthropicText(response.content),
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      modelKey: SYNTHESIS_MODEL.key,
      modelName: SYNTHESIS_MODEL.displayName,
      answer: "",
      error: msg,
    };
  }
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: DebateRequest = await request.json();
    const { question, models, round, previousResponses, locale, apiKeys, modelOverrides, toneInstruction } = body;
    const t = getTranslations(locale ?? "en");
    const clients = createApiClients(apiKeys);

    if (!question?.trim()) {
      return NextResponse.json(
        { error: t.pleaseEnterQuestion },
        { status: 400 }
      );
    }

    // Round 1: Initial answers
    if (round === 1) {
      const results = await Promise.all(models.map((m) => askModel(m, question, clients, modelOverrides)));
      const responses: Record<string, ModelResponse> = {};
      for (const r of results) responses[r.modelKey] = r;
      return NextResponse.json({ responses });
    }

    // Round 2: Cross review
    if (round === 2 && previousResponses) {
      const allAnswers = Object.values(previousResponses)
        .filter((r) => !r.error)
        .map((r) => `=== ${r.modelName} ===\n${r.answer}`)
        .join("\n\n");

      const reviewPrompt = t.reviewPrompt(allAnswers);

      const results = await Promise.all(
        models.map((m) => askModel(m, reviewPrompt, clients, modelOverrides))
      );
      const responses: Record<string, ModelResponse> = {};
      for (const r of results) responses[r.modelKey] = r;
      return NextResponse.json({ responses });
    }

    // Round 3: Synthesis
    if (round === 3 && previousResponses) {
      const allReviews = Object.values(previousResponses)
        .filter((r) => !r.error)
        .map((r) => `${t.finalOpinionLabel(r.modelName)}\n${r.answer}`)
        .join("\n\n");

      let synthesisPrompt = t.synthesisPrompt(question, allReviews);
      if (toneInstruction?.trim()) {
        synthesisPrompt += `\n\nTone/Style instruction: ${toneInstruction.trim()}`;
      }

      const result = await askSynthesisModel(synthesisPrompt, clients);
      return NextResponse.json({ synthesis: result });
    }

    return NextResponse.json(
      { error: t.invalidRequest },
      { status: 400 }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
