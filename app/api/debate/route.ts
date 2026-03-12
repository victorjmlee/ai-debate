import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getApiModel, getDisplayName, SYNTHESIS_MODEL } from "@/app/config/models";
import {
  anthropicClient,
  openaiClient,
  geminiClient,
  extractAnthropicText,
  type ModelResponse,
} from "@/app/lib/ai-clients";
import { getTranslations, type Locale } from "@/app/i18n/translations";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DebateRequest {
  question: string;
  models: string[];
  round: 1 | 2 | 3;
  locale?: Locale;
  previousResponses?: Record<string, ModelResponse>;
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
  prompt: string
): Promise<ModelResponse> {
  const name = getDisplayName(modelKey);
  if (!anthropicClient)
    return { modelKey, modelName: name, answer: "", error: "API key missing" };

  try {
    const response = await anthropicClient.messages.create({
      model: getApiModel(modelKey),
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
  prompt: string
): Promise<ModelResponse> {
  const name = getDisplayName(modelKey);
  if (!openaiClient)
    return { modelKey, modelName: name, answer: "", error: "API key missing" };

  try {
    const response = await openaiClient.chat.completions.create({
      model: getApiModel(modelKey),
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 4000,
      web_search_options: {},
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
  prompt: string
): Promise<ModelResponse> {
  const name = getDisplayName(modelKey);
  if (!geminiClient)
    return { modelKey, modelName: name, answer: "", error: "API key missing" };

  try {
    const response = await geminiClient.models.generateContent({
      model: getApiModel(modelKey),
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
  prompt: string
): Promise<ModelResponse> {
  switch (modelKey) {
    case "claude-haiku":
      return askAnthropic(modelKey, prompt);
    case "gpt-5-mini":
      return askOpenAI(modelKey, prompt);
    case "gemini":
      return askGemini(modelKey, prompt);
    default:
      return {
        modelKey,
        modelName: modelKey,
        answer: "",
        error: "Unknown model",
      };
  }
}

async function askSynthesisModel(prompt: string): Promise<ModelResponse> {
  if (!anthropicClient) {
    return askOpenAI("gpt-5-mini", prompt);
  }

  try {
    const response = await anthropicClient.messages.create({
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
    const { question, models, round, previousResponses, locale } = body;
    const t = getTranslations(locale ?? "en");

    if (!question?.trim()) {
      return NextResponse.json(
        { error: t.pleaseEnterQuestion },
        { status: 400 }
      );
    }

    // Round 1: Initial answers
    if (round === 1) {
      const results = await Promise.all(models.map((m) => askModel(m, question)));
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
        models.map((m) => askModel(m, reviewPrompt))
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

      const synthesisPrompt = t.synthesisPrompt(question, allReviews);

      const result = await askSynthesisModel(synthesisPrompt);
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
