import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { createServiceRoleClient } from "@/lib/auth/service-role";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INSERT_CHUNK = 1000;

type ParsedRow = { timestamp_ms: number; hr_bpm: number | null; rr_ms: number | null };

// Permissive header lookup: matches "timestamp_ms", "Timestamp_ms", "ts_ms", "time_ms".
function findColumn(headers: string[], candidates: string[]): number {
  const norm = headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  for (const c of candidates) {
    const idx = norm.indexOf(c);
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseIntOrNull(s: string | undefined): number | null {
  if (s == null) return null;
  const trimmed = s.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "null") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseCsv(text: string): { rows: ParsedRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { rows: [], errors: ["empty_csv"] };
  }

  const headers = lines[0].split(",");
  const tsIdx = findColumn(headers, ["timestamp_ms", "ts_ms", "time_ms", "t_ms"]);
  const hrIdx = findColumn(headers, ["hr_bpm", "hr", "bpm", "heart_rate"]);
  const rrIdx = findColumn(headers, ["rr_ms", "rr", "rri", "rri_ms"]);

  if (tsIdx < 0) {
    return { rows: [], errors: ["missing_timestamp_column"] };
  }
  if (hrIdx < 0 && rrIdx < 0) {
    return { rows: [], errors: ["missing_hr_and_rr_columns"] };
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const ts = parseIntOrNull(cells[tsIdx]);
    if (ts == null) {
      errors.push(`row_${i}_bad_timestamp`);
      continue;
    }
    const hr = hrIdx >= 0 ? parseIntOrNull(cells[hrIdx]) : null;
    const rr = rrIdx >= 0 ? parseIntOrNull(cells[rrIdx]) : null;
    if (hr == null && rr == null) {
      // Allow ts-only rows? No — without HR or RR there's nothing to recover.
      errors.push(`row_${i}_empty`);
      continue;
    }
    rows.push({ timestamp_ms: ts, hr_bpm: hr, rr_ms: rr });
  }
  return { rows, errors };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("rider_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: session } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  const text = await file.text();
  const { rows, errors: parseErrors } = parseCsv(text);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "no_rows", parse_errors: parseErrors.slice(0, 10) },
      { status: 400 },
    );
  }

  // De-dupe against existing samples for this session. samples_hr is append-only
  // (migration 035) so re-uploading the same CSV must be idempotent — collisions
  // are dropped, not errored. Pulls only the timestamp_ms column to keep this cheap.
  const admin = createServiceRoleClient();
  const { data: existing, error: existingErr } = await admin
    .from("samples_hr")
    .select("timestamp_ms")
    .eq("session_id", id);
  if (existingErr) {
    console.error("recovery_upload_existing_fetch_failed", existingErr);
    return NextResponse.json({ error: "existing_fetch_failed" }, { status: 500 });
  }
  const seen = new Set<number>();
  for (const r of existing ?? []) seen.add(Number(r.timestamp_ms));

  const toInsert: { session_id: string; timestamp_ms: number; hr_bpm: number | null; rr_ms: number | null; contact: null }[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (seen.has(r.timestamp_ms)) {
      skipped++;
      continue;
    }
    seen.add(r.timestamp_ms);
    toInsert.push({
      session_id: id,
      timestamp_ms: r.timestamp_ms,
      hr_bpm: r.hr_bpm,
      rr_ms: r.rr_ms,
      contact: null,
    });
  }

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + INSERT_CHUNK);
    const { error: insErr } = await admin.from("samples_hr").insert(chunk);
    if (insErr) {
      console.error("recovery_upload_insert_failed", { inserted, chunk_size: chunk.length, code: insErr.code, message: insErr.message });
      return NextResponse.json(
        { error: "insert_failed", inserted, skipped, code: insErr.code, message: insErr.message },
        { status: 500 },
      );
    }
    inserted += chunk.length;
  }

  // Enqueue compute so session_metrics gets rebuilt from the now-recovered data.
  // Mirrors the path in /api/sessions/[id] PATCH end branch.
  const { error: enqueueErr } = await admin
    .from("compute_jobs")
    .insert({ session_id: id, job_type: "compute", status: "queued" });
  if (enqueueErr) {
    console.error("recovery_upload_enqueue_failed", enqueueErr);
    return NextResponse.json({ ok: true, inserted, skipped, enqueued: false, parse_errors: parseErrors.slice(0, 10) });
  }

  return NextResponse.json({
    ok: true,
    inserted,
    skipped,
    enqueued: true,
    parse_errors: parseErrors.slice(0, 10),
  });
}
