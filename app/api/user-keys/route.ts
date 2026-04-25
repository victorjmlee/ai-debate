import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createSupabaseAdmin } from "@/app/lib/supabase";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from("user_api_keys")
    .select("anthropic_key, openai_key, google_key")
    .eq("user_email", session.user.email)
    .single();

  return NextResponse.json({ keys: data ?? null });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { anthropic, openai, google } = await request.json();

  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("user_api_keys")
    .upsert(
      {
        user_email: session.user.email,
        anthropic_key: anthropic ?? "",
        openai_key: openai ?? "",
        google_key: google ?? "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_email" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
