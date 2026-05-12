import { NextResponse, type NextRequest } from "next/server";

import {
  SIGNAL_BLOBS_BUCKET,
  chunkStoragePath,
  chunkUrlBody,
} from "@/lib/api/chunk-helpers";
import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { createServiceRoleClient } from "@/lib/auth/service-role";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = chunkUrlBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { session_id, stream, chunk_index } = parsed.data;

  // Pre-flight session check; same 404/403/409 split as the HR ingest route.
  const sessionRow = await supabase
    .from("sessions")
    .select("id, status, rider_id")
    .eq("id", session_id)
    .maybeSingle();
  if (!sessionRow.data) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }
  if (sessionRow.data.rider_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (sessionRow.data.status !== "active") {
    return NextResponse.json({ error: "session_not_active" }, { status: 409 });
  }

  const storage_path = chunkStoragePath(session_id, stream, chunk_index);

  // Mint a one-time signed upload URL via the service-role client. The browser
  // posts raw bytes directly to Storage; the next request (chunk-commit) writes
  // the index row under the user's RLS context.
  const service = createServiceRoleClient();
  const signed = await service.storage
    .from(SIGNAL_BLOBS_BUCKET)
    .createSignedUploadUrl(storage_path);
  if (signed.error || !signed.data) {
    console.error("chunk_url_failed", { message: signed.error?.message });
    return NextResponse.json({ error: "signed_url_failed" }, { status: 500 });
  }

  return NextResponse.json({
    url: signed.data.signedUrl,
    token: signed.data.token,
    storage_path,
  });
}
