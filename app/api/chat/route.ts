import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
}

interface ModelResponse {
  modelKey: string;
  modelName: string;
  answer: string;
  error?: string;
  tokensUsed?: number;
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

async function chatClaude(
  messages: ChatMessage[],
  model: string
): Promise<ModelResponse> {
  const client = getAnthropicClient();
  if (!client) {
    return { modelKey: model, modelName: "Claude", answer: "", error: "API 키 없음" };
  }

  const modelId =
    model === "claude-opus"
      ? "claude-opus-4-20250514"
      : "claude-sonnet-4-20250514";
  const displayName =
    model === "claude-opus" ? "Claude Opus" : "Claude Sonnet";

  try {
    const response = await client.messages.create({
      model: modelId,
      max_tokens: 4000,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    return {
      modelKey: model,
      modelName: displayName,
      answer: text,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { modelKey: model, modelName: displayName, answer: "", error: msg };
  }
}

async function chatGPT4o(messages: ChatMessage[]): Promise<ModelResponse> {
  const client = getOpenAIClient();
  if (!client) {
    return { modelKey: "gpt-4o", modelName: "GPT-4o", answer: "", error: "API 키 없음" };
  }

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 4000,
    });
    return {
      modelKey: "gpt-4o",
      modelName: "GPT-4o",
      answer: response.choices[0]?.message?.content ?? "",
      tokensUsed: response.usage?.total_tokens,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { modelKey: "gpt-4o", modelName: "GPT-4o", answer: "", error: msg };
  }
}

async function chatGemini(messages: ChatMessage[]): Promise<ModelResponse> {
  const client = getGeminiClient();
  if (!client) {
    return {
      modelKey: "gemini",
      modelName: "Gemini 2.0 Flash",
      answer: "",
      error: "API 키 없음",
    };
  }

  try {
    // Gemini SDK takes a single string — format conversation history into one prompt
    const formatted = messages
      .map((m) => (m.role === "user" ? `User: ${m.content}` : `Assistant: ${m.content}`))
      .join("\n\n");
    const lastUserMsg = messages[messages.length - 1];
    const prompt =
      messages.length > 1
        ? `이전 대화:\n${formatted}\n\n위 대화의 맥락을 이어서 마지막 질문에 답변해주세요.`
        : lastUserMsg.content;

    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });
    return {
      modelKey: "gemini",
      modelName: "Gemini 2.0 Flash",
      answer: response.text ?? "",
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      modelKey: "gemini",
      modelName: "Gemini 2.0 Flash",
      answer: "",
      error: msg,
    };
  }
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { model, messages } = body;

    if (!messages?.length) {
      return NextResponse.json(
        { error: "메시지를 입력해주세요." },
        { status: 400 }
      );
    }

    let response: ModelResponse;

    switch (model) {
      case "claude-sonnet":
        response = await chatClaude(messages, "claude-sonnet");
        break;
      case "claude-opus":
        response = await chatClaude(messages, "claude-opus");
        break;
      case "gpt-4o":
        response = await chatGPT4o(messages);
        break;
      case "gemini":
        response = await chatGemini(messages);
        break;
      default:
        return NextResponse.json(
          { error: "알 수 없는 모델입니다." },
          { status: 400 }
        );
    }

    return NextResponse.json({ response });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
