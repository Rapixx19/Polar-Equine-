import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { env } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/auth/server";

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.email, {
    redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/auth/reset`,
  });

  if (error) {
    // Log but always 200 — never leak whether the email exists.
    console.error("forgot_password_send_failed", {
      code: error.code,
      status: error.status,
    });
  }

  return NextResponse.json({ ok: true });
}
