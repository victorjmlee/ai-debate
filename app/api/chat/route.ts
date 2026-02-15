import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { getApiModel, getDisplayName, SYNTHESIS_MODEL } from "@/app/config/models";

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

async function chatAnthropic(modelKey: string, messages: ChatMessage[]): Promise<ModelResponse> {
  const client = getAnthropicClient();
  const name = getDisplayName(modelKey);
  if (!client)
    return { modelKey, modelName: name, answer: "", error: "API 키 없음" };

  try {
    const response = await client.messages.create({
      model: getApiModel(modelKey),
      max_tokens: 4000,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return {
      modelKey,
      modelName: name,
      answer: text,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { modelKey, modelName: name, answer: "", error: msg };
  }
}

async function chatOpenAI(modelKey: string, messages: ChatMessage[]): Promise<ModelResponse> {
  const client = getOpenAIClient();
  const name = getDisplayName(modelKey);
  if (!client)
    return { modelKey, modelName: name, answer: "", error: "API 키 없음" };

  try {
    const response = await client.chat.completions.create({
      model: getApiModel(modelKey),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_completion_tokens: 4000,
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

async function chatGemini(modelKey: string, messages: ChatMessage[]): Promise<ModelResponse> {
  const client = getGeminiClient();
  const name = getDisplayName(modelKey);
  if (!client)
    return { modelKey, modelName: name, answer: "", error: "API 키 없음" };

  try {
    const formatted = messages
      .map((m) => (m.role === "user" ? `User: ${m.content}` : `Assistant: ${m.content}`))
      .join("\n\n");
    const lastUserMsg = messages[messages.length - 1];
    const prompt =
      messages.length > 1
        ? `이전 대화:\n${formatted}\n\n위 대화의 맥락을 이어서 마지막 질문에 답변해주세요.`
        : lastUserMsg.content;

    const response = await client.models.generateContent({
      model: getApiModel(modelKey),
      contents: prompt,
    });
    return {
      modelKey,
      modelName: name,
      answer: response.text ?? "",
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { modelKey, modelName: name, answer: "", error: msg };
  }
}

async function chatAnthropicSynthesis(messages: ChatMessage[]): Promise<ModelResponse> {
  const client = getAnthropicClient();
  const modelKey = SYNTHESIS_MODEL.key;
  const name = SYNTHESIS_MODEL.displayName;
  if (!client)
    return { modelKey, modelName: name, answer: "", error: "API 키 없음" };

  try {
    const response = await client.messages.create({
      model: SYNTHESIS_MODEL.apiModel,
      max_tokens: 4000,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return {
      modelKey,
      modelName: name,
      answer: text,
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
    const { model, messages } = body;

    if (!messages?.length) {
      return NextResponse.json({ error: "메시지를 입력해주세요." }, { status: 400 });
    }

    let response: ModelResponse;

    switch (model) {
      case "claude-haiku":
        response = await chatAnthropic(model, messages);
        break;
      case "gpt-5-mini":
        response = await chatOpenAI(model, messages);
        break;
      case "gemini":
        response = await chatGemini(model, messages);
        break;
      case "synthesis":
        // Synthesis uses Claude Sonnet — call Anthropic with synthesis model ID
        response = await chatAnthropicSynthesis(messages);
        break;
      default:
        return NextResponse.json({ error: "알 수 없는 모델입니다." }, { status: 400 });
    }

    return NextResponse.json({ response });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
