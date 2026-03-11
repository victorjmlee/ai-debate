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

// ─── Types ───────────────────────────────────────────────────────────────────

interface DebateRequest {
  question: string;
  models: string[];
  round: 1 | 2 | 3;
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
    return { modelKey, modelName: name, answer: "", error: "API 키 없음" };

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
    return { modelKey, modelName: name, answer: "", error: "API 키 없음" };

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
    return { modelKey, modelName: name, answer: "", error: "API 키 없음" };

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
        error: "알 수 없는 모델",
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
    const { question, models, round, previousResponses } = body;

    if (!question?.trim()) {
      return NextResponse.json(
        { error: "질문을 입력해주세요." },
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

      const reviewPrompt = `다른 AI들의 답변을 검토해주세요.

${allAnswers}

다음 형식으로 간결하게 작성해주세요:

**다른 AI들의 강점**
- (각 AI의 좋은 점을 1-2줄씩)

**보완할 점**
- (놓친 관점이나 개선 가능한 부분)

**통합 의견**
(모든 답변의 장점을 합친 최적의 답변을 산문체로 작성)

규칙: 이모지 사용 금지. 테이블 사용 금지. 코드블록 사용 금지. 간결한 산문체로 작성.`;

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
        .map((r) => `=== ${r.modelName}의 최종 의견 ===\n${r.answer}`)
        .join("\n\n");

      const synthesisPrompt = `원래 질문: "${question}"

여러 AI 모델들의 교차 리뷰 결과:

${allReviews}

다음 형식으로 작성해주세요:

**공통 합의**
(모든 AI가 동의하는 핵심 내용을 2-3문장으로)

**각 AI의 고유 인사이트**
- Claude: (한 줄 요약)
- GPT: (한 줄 요약)
- Gemini: (한 줄 요약)

**Sonnet 자체 의견**
(위 AI들의 답변과 별개로, 웹 검색을 통해 직접 조사한 내용을 바탕으로 당신만의 독자적인 분석과 의견을 제시해주세요. 다른 AI들이 놓친 관점이나 최신 정보가 있다면 포함해주세요.)

**최종 통합 답변**
(모든 AI의 의견과 당신의 자체 조사를 종합하여, 중복을 제거하고 최적의 답변을 산문체로 명확하게 작성.)

규칙: 이모지 사용 금지. 테이블 사용 금지. 코드블록 사용 금지. 원본 답변을 그대로 복사하지 말고, 핵심만 추출하여 간결하게 재구성.`;

      const result = await askSynthesisModel(synthesisPrompt);
      return NextResponse.json({ synthesis: result });
    }

    return NextResponse.json(
      { error: "잘못된 요청입니다." },
      { status: 400 }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
