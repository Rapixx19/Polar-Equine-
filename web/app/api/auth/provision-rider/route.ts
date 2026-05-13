import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { isAdminEmail } from "@/lib/auth/admins";

const Body = z.object({
  display_name: z.string().trim().min(1).max(80),
});

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("rider_profiles")
    .upsert({
      id: user.id,
      display_name: parsed.display_name,
      is_admin: isAdminEmail(user.email),
      consented_at: new Date().toISOString(),
    })
    .select("id, display_name, is_admin, consented_at")
    .single();

  if (error || !data) {
    console.error(
      "provision_rider_failed " +
        JSON.stringify({
          err: error,
          errKeys: error ? Object.keys(error) : null,
          errString: error ? String(error) : null,
          hasData: !!data,
          userId: user.id,
          email: user.email,
        }),
    );
    return NextResponse.json({ error: "provision_failed" }, { status: 500 });
  }

  return NextResponse.json({ rider_profile: data });
}
