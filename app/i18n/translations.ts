export type Locale = "en" | "ko";

const translations = {
  en: {
    // Sidebar
    history: "History",
    newChat: "+ New Chat",
    noHistory: "No conversation history yet",

    // Input view
    heroTitle: "Which AI answers best?",
    heroSubtitle: "Compare 3 AIs side by side, then continue chatting with your favorite",
    inputPlaceholder: "Enter a question to ask the AIs...",
    compareButton: "Compare AI Responses →",
    noApiKeys: "No API keys configured. Add them from API Keys.",
    noApiKey: "No API key",
    models: "Models",

    // Compare view
    question: "Question",
    followUpChat: "Follow-up Chat",
    followUpPlaceholder: "Follow-up question...",
    close: "Close",
    send: "Send",
    continueChat: "Continue Chat →",
    chatWithAI: "Chat with this AI →",
    deepAnalysisButton: "Deep Analysis — Cross-Model Review & Synthesis →",
    deepAnalysisDesc: "Each AI reviews the others' answers, then generates a final synthesis",

    // Deep analysis view
    backToComparison: "← Back to Comparison",
    deepAnalysis: "Deep Analysis",
    deepAnalysisSubtitle: "Each AI reviews the others' answers and synthesizes all insights",
    crossReview: "Cross Review",
    finalSynthesis: "Final Synthesis",
    chatWithSonnet: "Chat with Sonnet →",
    synthesisPlaceholder: "Ask a follow-up about the synthesis...",
    stepCrossReview: "Cross Review",
    stepSynthesis: "Synthesis",

    // Time
    justNow: "Just now",
    mAgo: (n: number) => `${n}m ago`,
    hAgo: (n: number) => `${n}h ago`,
    dAgo: (n: number) => `${n}d ago`,

    // Errors
    requestFailed: "Request failed",
    unknownError: "Unknown error",

    // API prompts
    reviewPrompt: (allAnswers: string) => `Please review the other AIs' answers.

${allAnswers}

Write concisely in the following format:

**Strengths of Other AIs**
- (1-2 lines on each AI's strong points)

**Areas for Improvement**
- (Missed perspectives or areas that could be improved)

**Integrated Opinion**
(Write an optimal answer in prose that combines the best parts of all responses)

Rules: No emojis. No tables. No code blocks. Write in concise prose.`,

    synthesisPrompt: (question: string, allReviews: string) => `Original question: "${question}"

Cross-review results from multiple AI models:

${allReviews}

Please write in the following format:

**Common Consensus**
(2-3 sentences on key points all AIs agree on)

**Unique Insights from Each AI**
- Claude: (one-line summary)
- GPT: (one-line summary)
- Gemini: (one-line summary)

**Sonnet's Own Opinion**
(Independently from the other AIs' answers, present your own analysis and opinion based on your own web research. Include any perspectives or recent information the other AIs may have missed.)

**Final Integrated Answer**
(Synthesize all AI opinions and your own research, remove redundancy, and write a clear, optimal answer in prose.)

Rules: No emojis. No tables. No code blocks. Do not copy original answers verbatim — extract key points and restructure concisely.`,

    finalOpinionLabel: (name: string) => `=== ${name}'s Final Opinion ===`,
    synthesisIntro: (answer: string) => `The following is a comprehensive synthesis of multiple AI responses:\n\n${answer}`,
    followUpQ: (content: string) => `[Follow-up Q] ${content}`,
    followUpA: (content: string) => `[Follow-up A] ${content}`,
    followUpConversation: "--- Follow-up conversation ---",

    // Context
    addContext: "Add Context",
    contextPlaceholder: "Paste customer ticket, Slack thread, issue description, or any relevant background...",

    // Tone selector
    toneLabel: "Response Tone",
    tonePlaceholder: "Custom style instructions (e.g. formal, concise, no jargon)...",

    // API errors
    apiKeyMissing: "API key missing",
    unknownModel: "Unknown model",
    pleaseEnterQuestion: "Please enter a question.",
    pleaseEnterMessage: "Please enter a message.",
    unknownModelError: "Unknown model.",
    invalidRequest: "Invalid request.",
  },

  ko: {
    history: "이전 대화",
    newChat: "+ 새 대화",
    noHistory: "아직 대화 기록이 없습니다",

    heroTitle: "어떤 AI가 가장 잘 답할까?",
    heroSubtitle: "3개 AI를 동시에 비교하고, 마음에 드는 AI와 대화를 이어가세요",
    inputPlaceholder: "AI에게 물어볼 질문을 입력하세요...",
    compareButton: "AI 답변 비교하기 →",
    noApiKeys: "API 키가 설정되지 않았습니다. API Keys에서 추가하세요.",
    noApiKey: "API 키 없음",
    models: "Models",

    question: "질문",
    followUpChat: "후속 대화",
    followUpPlaceholder: "후속 질문...",
    close: "닫기",
    send: "전송",
    continueChat: "대화 이어가기 →",
    chatWithAI: "이 AI와 대화하기 →",
    deepAnalysisButton: "Deep Analysis — 모델 간 교차 리뷰 & 종합 →",
    deepAnalysisDesc: "각 AI가 서로의 답변을 검토하고, 최종 종합 분석을 생성합니다",

    backToComparison: "← 비교로 돌아가기",
    deepAnalysis: "Deep Analysis",
    deepAnalysisSubtitle: "각 AI가 다른 AI의 답변을 리뷰하고, 모든 인사이트를 종합합니다",
    crossReview: "교차 리뷰",
    finalSynthesis: "최종 종합",
    chatWithSonnet: "Sonnet과 대화하기 →",
    synthesisPlaceholder: "종합 분석에 대해 추가 질문...",
    stepCrossReview: "교차 리뷰",
    stepSynthesis: "종합",

    justNow: "방금",
    mAgo: (n: number) => `${n}분 전`,
    hAgo: (n: number) => `${n}시간 전`,
    dAgo: (n: number) => `${n}일 전`,

    requestFailed: "요청 실패",
    unknownError: "알 수 없는 에러",

    reviewPrompt: (allAnswers: string) => `다른 AI들의 답변을 검토해주세요.

${allAnswers}

다음 형식으로 간결하게 작성해주세요:

**다른 AI들의 강점**
- (각 AI의 좋은 점을 1-2줄씩)

**보완할 점**
- (놓친 관점이나 개선 가능한 부분)

**통합 의견**
(모든 답변의 장점을 합친 최적의 답변을 산문체로 작성)

규칙: 이모지 사용 금지. 테이블 사용 금지. 코드블록 사용 금지. 간결한 산문체로 작성.`,

    synthesisPrompt: (question: string, allReviews: string) => `원래 질문: "${question}"

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

규칙: 이모지 사용 금지. 테이블 사용 금지. 코드블록 사용 금지. 원본 답변을 그대로 복사하지 말고, 핵심만 추출하여 간결하게 재구성.`,

    finalOpinionLabel: (name: string) => `=== ${name}의 최종 의견 ===`,
    synthesisIntro: (answer: string) => `다음은 여러 AI의 답변을 종합 분석한 결과입니다:\n\n${answer}`,
    followUpQ: (content: string) => `[추가 질문] ${content}`,
    followUpA: (content: string) => `[추가 답변] ${content}`,
    followUpConversation: "--- 추가 대화 ---",

    // Context
    addContext: "컨텍스트 추가",
    contextPlaceholder: "고객 티켓, 슬랙 스레드, 이슈 내용 등 관련 배경을 붙여넣으세요...",

    // Tone selector
    toneLabel: "답변 어투",
    tonePlaceholder: "커스텀 스타일 지침 (예: 격식체, 간결하게, 전문용어 없이)...",

    apiKeyMissing: "API 키 없음",
    unknownModel: "알 수 없는 모델",
    pleaseEnterQuestion: "질문을 입력해주세요.",
    pleaseEnterMessage: "메시지를 입력해주세요.",
    unknownModelError: "알 수 없는 모델입니다.",
    invalidRequest: "잘못된 요청입니다.",
  },
};

export type Translations = {
  history: string;
  newChat: string;
  noHistory: string;
  heroTitle: string;
  heroSubtitle: string;
  inputPlaceholder: string;
  compareButton: string;
  noApiKeys: string;
  noApiKey: string;
  models: string;
  question: string;
  followUpChat: string;
  followUpPlaceholder: string;
  close: string;
  send: string;
  continueChat: string;
  chatWithAI: string;
  deepAnalysisButton: string;
  deepAnalysisDesc: string;
  backToComparison: string;
  deepAnalysis: string;
  deepAnalysisSubtitle: string;
  crossReview: string;
  finalSynthesis: string;
  chatWithSonnet: string;
  synthesisPlaceholder: string;
  stepCrossReview: string;
  stepSynthesis: string;
  justNow: string;
  mAgo: (n: number) => string;
  hAgo: (n: number) => string;
  dAgo: (n: number) => string;
  requestFailed: string;
  unknownError: string;
  reviewPrompt: (allAnswers: string) => string;
  synthesisPrompt: (question: string, allReviews: string) => string;
  finalOpinionLabel: (name: string) => string;
  synthesisIntro: (answer: string) => string;
  followUpQ: (content: string) => string;
  followUpA: (content: string) => string;
  followUpConversation: string;
  addContext: string;
  contextPlaceholder: string;
  toneLabel: string;
  tonePlaceholder: string;
  apiKeyMissing: string;
  unknownModel: string;
  pleaseEnterQuestion: string;
  pleaseEnterMessage: string;
  unknownModelError: string;
  invalidRequest: string;
};

export function getTranslations(locale: Locale): Translations {
  return translations[locale] ?? translations.en;
}

export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language || "";
  if (lang.startsWith("ko")) return "ko";
  return "en";
}
