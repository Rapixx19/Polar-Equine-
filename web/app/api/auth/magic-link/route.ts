import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { env } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/auth/server";

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  consented: z.literal(true),
});

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.email,
    options: {
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    // Do not leak whether the email exists; surface a generic failure.
    console.error("magic_link_send_failed", { code: error.code, status: error.status });
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }

  return NextResponse.json({ sent: true });
}
