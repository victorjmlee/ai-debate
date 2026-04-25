import { NextRequest, NextResponse } from "next/server";
import { getAvailableModels, type ApiKeys } from "@/app/lib/ai-clients";

export async function GET() {
  return NextResponse.json({ available: getAvailableModels() });
}

export async function POST(request: NextRequest) {
  const body: { apiKeys?: ApiKeys } = await request.json().catch(() => ({}));
  return NextResponse.json({ available: getAvailableModels(body.apiKeys) });
}
