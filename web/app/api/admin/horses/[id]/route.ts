import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Length cap on admin_notes — 500 chars matches the rider equivalent and keeps
// pastes from ballooning the row.
const TEXT_MAX = 500;

const Body = z
  .object({
    target_session_count: z.number().int().min(0).max(9999).nullable().optional(),
    target_ride_minutes: z.number().int().min(0).max(99999).nullable().optional(),
    admin_notes: z.string().max(TEXT_MAX).nullable().optional(),
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

  // Normalise empty admin_notes string → null so "no note" vs "cleared" stay
  // unambiguous in the DB. A zero target means "no goal" so we also flatten
  // 0 → null on the two integer fields.
  const dbPatch: typeof patch = { ...patch };
  if (dbPatch.admin_notes === "") dbPatch.admin_notes = null;
  if (dbPatch.target_session_count === 0) dbPatch.target_session_count = null;
  if (dbPatch.target_ride_minutes === 0) dbPatch.target_ride_minutes = null;

  const { data, error } = await supabase
    .from("horses")
    .update(dbPatch)
    .eq("id", id)
    .select("id, name, target_session_count, target_ride_minutes, admin_notes")
    .single();

  if (error || !data) {
    console.error(
      "admin_update_horse_failed " +
        JSON.stringify({
          err: error,
          targetId: id,
          patchKeys: Object.keys(patch),
        }),
    );
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, horse: data });
}
