# AI Debate Arena

Compare AI responses side-by-side, pick the best one, and continue the conversation.

AI Debate Arena lets you ask the same question to **3 different AI models** simultaneously, compare their answers, and seamlessly transition into a deep conversation with the model you like best.

## How It Works

```
Ask a Question → Compare 3 AI Responses → Choose Your AI → Continue Chatting
```

1. **Compare** — Your question goes to Claude, GPT, and Gemini in parallel. See all three responses side-by-side.
2. **Choose** — Pick the AI whose answer resonates most with you.
3. **Chat** — Continue the conversation with full context preserved. The AI remembers your original question and its answer.

### Deep Analysis (Optional)

For complex topics, trigger **Deep Analysis** from the comparison view. Each AI reviews the others' responses and a final synthesis combines all insights.

## Models

| Model | Provider | Strengths |
|-------|----------|-----------|
| Claude Haiku 4.5 | Anthropic | Safety, honesty, nuanced reasoning |
| GPT-5 Mini | OpenAI | Versatility, broad knowledge |
| Gemini 2.5 Flash | Google | Speed, multimodal, search integration |

Each provider represents a distinct design philosophy — comparing them reveals how different AI architectures approach the same problem.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript + React 19
- **Styling**: Tailwind CSS 4.0
- **AI SDKs**: `@anthropic-ai/sdk`, `openai`, `@google/genai`
- **Markdown**: `react-markdown`

## Getting Started

### Prerequisites

- Node.js 18+
- API keys from at least one provider

### Installation

```bash
git clone https://github.com/your-username/ai-debate.git
cd ai-debate
npm install
```

### API Keys

Open the app and use **API Keys** in the header to save your provider keys in this browser. The keys are stored in `localStorage` and are sent only when you make model requests.

You can also provide server-side fallback keys with a `.env.local` file:

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AI...
```

You only need keys for the models you want to use. Models without keys will be grayed out in the UI.

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
npm start
```

## Project Structure

```
ai-debate/
├── app/
│   ├── page.tsx              # Main UI (Compare → Choose → Chat flow)
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Dark theme + animations
│   └── api/
│       ├── debate/route.ts   # Multi-model comparison + deep analysis
│       ├── chat/route.ts     # Individual model conversation
│       └── models/route.ts   # Model availability check
├── package.json
└── README.md
```

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/models` | GET | Check which models have API keys configured |
| `/api/debate` | POST | Run comparison (round 1), cross-review (round 2), or synthesis (round 3) |
| `/api/chat` | POST | Continue conversation with a single model |

## Deployment

Deploy to Vercel in one click:

1. Push to GitHub
2. Import in [Vercel](https://vercel.com)
3. Add environment variables in Settings → Environment Variables
4. Deploy

## Roadmap

- [ ] Subscription tiers (Free / Basic / Pro)
- [ ] Usage tracking and rate limiting
- [ ] Responsive mobile layout (2-model comparison)
- [ ] Model routing (auto-select best model per question type)
- [ ] Conversation history and bookmarks
- [ ] Additional providers (DeepSeek, Grok, Mistral)

## License

MIT
