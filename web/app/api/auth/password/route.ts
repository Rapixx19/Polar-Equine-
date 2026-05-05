import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/auth/server";

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(72),
});

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  const signIn = await supabase.auth.signInWithPassword(parsed);
  if (!signIn.error && signIn.data.session) {
    return NextResponse.json({ ok: true, mode: "signin" });
  }

  const signUp = await supabase.auth.signUp(parsed);
  if (signUp.error) {
    console.error("password_signup_failed", {
      code: signUp.error.code,
      status: signUp.error.status,
    });
    return NextResponse.json({ error: "signup_failed" }, { status: 400 });
  }
  if (!signUp.data.session) {
    return NextResponse.json(
      { error: "email_confirmation_required" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, mode: "signup" });
}
