import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ModelResponse {
  modelKey: string;
  modelName: string;
  answer: string;
  error?: string;
  tokensUsed?: number;
}

interface DebateRequest {
  question: string;
  models: string[];
  round: 1 | 2 | 3;
  previousResponses?: Record<string, ModelResponse>;
}

// ─── AI Clients (lazy init) ──────────────────────────────────────────────────

function getAnthropicClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function getGeminiClient() {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}

// ─── Model Callers ───────────────────────────────────────────────────────────

async function askClaudeHaiku(prompt: string): Promise<ModelResponse> {
  const client = getAnthropicClient();
  if (!client)
    return { modelKey: "claude-haiku", modelName: "Claude Haiku", answer: "", error: "API 키 없음" };

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });
    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    return {
      modelKey: "claude-haiku",
      modelName: "Claude Haiku",
      answer: text,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { modelKey: "claude-haiku", modelName: "Claude Haiku", answer: "", error: msg };
  }
}

async function askGPT5Mini(prompt: string): Promise<ModelResponse> {
  const client = getOpenAIClient();
  if (!client)
    return { modelKey: "gpt-5-mini", modelName: "GPT-5 Mini", answer: "", error: "API 키 없음" };

  try {
    const response = await client.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 4000,
    });
    return {
      modelKey: "gpt-5-mini",
      modelName: "GPT-5 Mini",
      answer: response.choices[0]?.message?.content ?? "",
      tokensUsed: response.usage?.total_tokens,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { modelKey: "gpt-5-mini", modelName: "GPT-5 Mini", answer: "", error: msg };
  }
}

async function askGemini(prompt: string): Promise<ModelResponse> {
  const client = getGeminiClient();
  if (!client)
    return {
      modelKey: "gemini",
      modelName: "Gemini 2.5 Flash",
      answer: "",
      error: "API 키 없음",
    };

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return {
      modelKey: "gemini",
      modelName: "Gemini 2.5 Flash",
      answer: response.text ?? "",
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      modelKey: "gemini",
      modelName: "Gemini 2.5 Flash",
      answer: "",
      error: msg,
    };
  }
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

async function askModel(
  modelKey: string,
  prompt: string
): Promise<ModelResponse> {
  switch (modelKey) {
    case "claude-haiku":
      return askClaudeHaiku(prompt);
    case "gpt-5-mini":
      return askGPT5Mini(prompt);
    case "gemini":
      return askGemini(prompt);
    default:
      return {
        modelKey,
        modelName: modelKey,
        answer: "",
        error: "알 수 없는 모델",
      };
  }
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: DebateRequest = await request.json();
    const { question, models, round, previousResponses } = body;

    if (!question?.trim()) {
      return NextResponse.json(
        { error: "질문을 입력해주세요." },
        { status: 400 }
      );
    }

    // Round 1: Initial answers
    if (round === 1) {
      const results = await Promise.all(
        models.map((m) => askModel(m, question))
      );
      const responses: Record<string, ModelResponse> = {};
      for (const r of results) {
        responses[r.modelKey] = r;
      }
      return NextResponse.json({ responses });
    }

    // Round 2: Cross review
    if (round === 2 && previousResponses) {
      const allAnswers = Object.values(previousResponses)
        .filter((r) => !r.error)
        .map((r) => `=== ${r.modelName} ===\n${r.answer}`)
        .join("\n\n");

      const reviewPrompt = `다른 AI들의 답변:\n\n${allAnswers}\n\n당신의 답변과 비교하여:\n1. 다른 AI들의 좋은 점\n2. 당신 답변의 개선점\n3. 모든 답변을 통합한 최고의 답변\n\n을 작성해주세요.`;

      const results = await Promise.all(
        models.map((m) => askModel(m, reviewPrompt))
      );
      const responses: Record<string, ModelResponse> = {};
      for (const r of results) {
        responses[r.modelKey] = r;
      }
      return NextResponse.json({ responses });
    }

    // Round 3: Synthesis
    if (round === 3 && previousResponses) {
      const allReviews = Object.values(previousResponses)
        .filter((r) => !r.error)
        .map((r) => `=== ${r.modelName}의 최종 의견 ===\n${r.answer}`)
        .join("\n\n");

      const synthesisPrompt = `여러 AI 모델들의 최종 의견:\n\n${allReviews}\n\n모든 AI들의 의견을 종합하여:\n1. 공통적으로 동의하는 핵심 내용\n2. 각자의 독특한 인사이트\n3. 통합된 최고의 최종 답변\n\n을 작성해주세요. 중복은 제거하고 보완적인 내용을 합쳐주세요.`;

      // Use Claude Haiku for synthesis, fallback to GPT-5 Mini
      let result: ModelResponse;
      if (process.env.ANTHROPIC_API_KEY) {
        result = await askClaudeHaiku(synthesisPrompt);
      } else {
        result = await askGPT5Mini(synthesisPrompt);
      }

      return NextResponse.json({ synthesis: result });
    }

    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
