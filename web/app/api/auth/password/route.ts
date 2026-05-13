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
  if (signIn.error || !signIn.data.session) {
    // V0 onboarding is manual: admins create accounts in Supabase Studio.
    // No self-serve signup. A failed sign-in is therefore "not registered yet"
    // — surface a generic invalid-credentials error (don't leak whether the
    // email exists in auth.users).
    console.warn("password_signin_failed", {
      code: signIn.error?.code,
      status: signIn.error?.status,
    });
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  // Auto-route admins straight to /admin, riders to /home. Profile may be
  // missing on a fresh account — /home then redirects to /auth/provision.
  const { data: profile } = await supabase
    .from("rider_profiles")
    .select("is_admin")
    .eq("id", signIn.data.user.id)
    .maybeSingle();

  const redirect_to = profile?.is_admin ? "/admin" : "/home";
  return NextResponse.json({ ok: true, mode: "signin", redirect_to });
}
