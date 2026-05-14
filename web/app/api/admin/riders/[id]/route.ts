import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Free-text length cap. 500 chars is plenty for the use case (a sentence-or-two
// admin reminder, or a "next focus" prompt shown on the rider's home banner) and
// keeps a typo'd paste of a whole article from sitting in the row.
const TEXT_MAX = 500;

const Body = z
  .object({
    session_quota_target: z.number().int().min(1).max(9999).optional(),
    program_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    admin_notes: z.string().max(TEXT_MAX).nullable().optional(),
    next_focus: z.string().max(TEXT_MAX).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "empty_patch" });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("rider_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!me?.is_admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let patch: z.infer<typeof Body>;
  try {
    patch = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Normalise empty strings → null so the column stays meaningful ("no note"
  // vs "explicitly cleared"). Zod already rejects strings > 500 chars.
  const dbPatch: typeof patch = { ...patch };
  if (dbPatch.admin_notes === "") dbPatch.admin_notes = null;
  if (dbPatch.next_focus === "") dbPatch.next_focus = null;

  const { data, error } = await supabase
    .from("rider_profiles")
    .update(dbPatch)
    .eq("id", id)
    .select("id, session_quota_target, program_end_date, admin_notes, next_focus")
    .single();

  if (error || !data) {
    console.error(
      "admin_update_rider_failed " +
        JSON.stringify({
          err: error,
          targetId: id,
          patchKeys: Object.keys(patch),
        }),
    );
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rider: data });
}
