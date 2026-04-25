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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  locale?: Locale;
  apiKeys?: ApiKeys;
  modelOverrides?: Record<string, string>;
}

// ─── Web-search-enabled tool configs ────────────────────────────────────────

const ANTHROPIC_TOOLS_BASIC: Anthropic.Messages.ToolUnion[] = [
  { type: "web_search_20250305", name: "web_search", max_uses: 3 },
];

const GEMINI_SEARCH_CONFIG = {
  tools: [{ googleSearch: {} }],
};

// ─── Model Callers ───────────────────────────────────────────────────────────

async function chatAnthropic(
  modelKey: string,
  messages: ChatMessage[],
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
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
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

async function chatOpenAI(
  modelKey: string,
  messages: ChatMessage[],
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
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
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

async function chatGemini(
  modelKey: string,
  messages: ChatMessage[],
  clients: ApiClients,
  overrides?: Record<string, string>
): Promise<ModelResponse> {
  const name = getDisplayName(modelKey, overrides);
  if (!clients.geminiClient)
    return { modelKey, modelName: name, answer: "", error: "API key missing" };

  try {
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

    const response = await clients.geminiClient.models.generateContent({
      model: getApiModel(modelKey, overrides),
      contents,
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

async function chatAnthropicSynthesis(
  messages: ChatMessage[],
  clients: ApiClients
): Promise<ModelResponse> {
  const modelKey = SYNTHESIS_MODEL.key;
  const name = SYNTHESIS_MODEL.displayName;
  if (!clients.anthropicClient)
    return { modelKey, modelName: name, answer: "", error: "API key missing" };

  try {
    const response = await clients.anthropicClient.messages.create({
      model: SYNTHESIS_MODEL.apiModel,
      max_tokens: 4000,
      tools: ANTHROPIC_TOOLS_BASIC,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
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

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { model, messages, locale, apiKeys, modelOverrides } = body;
    const t = getTranslations(locale ?? "en");
    const clients = createApiClients(apiKeys);

    if (!messages?.length) {
      return NextResponse.json(
        { error: t.pleaseEnterMessage },
        { status: 400 }
      );
    }

    let response: ModelResponse;

    switch (model) {
      case "claude-haiku":
        response = await chatAnthropic(model, messages, clients, modelOverrides);
        break;
      case "gpt-5-mini":
        response = await chatOpenAI(model, messages, clients, modelOverrides);
        break;
      case "gemini":
        response = await chatGemini(model, messages, clients, modelOverrides);
        break;
      case "synthesis":
        response = await chatAnthropicSynthesis(messages, clients);
        break;
      default:
        return NextResponse.json(
          { error: t.unknownModelError },
          { status: 400 }
        );
    }

    return NextResponse.json({ response });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
