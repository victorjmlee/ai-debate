import { NextResponse } from "next/server";

export async function GET() {
  const available: Record<string, boolean> = {
    "claude-sonnet": !!process.env.ANTHROPIC_API_KEY,
    "claude-opus": !!process.env.ANTHROPIC_API_KEY,
    "gpt-4o": !!process.env.OPENAI_API_KEY,
    gemini: !!process.env.GOOGLE_API_KEY,
  };

  return NextResponse.json({ available });
}
