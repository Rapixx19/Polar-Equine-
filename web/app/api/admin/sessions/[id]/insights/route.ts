import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { generateInsight } from "@/lib/insights/anthropic-client";
import { buildInsightInput, type RawLabelRow } from "@/lib/insights/build-input";
import {
  sessionInsightsTable,
  type SessionInsightRow,
} from "@/lib/insights/insights-table";
import { buildInsightPrompt, MODEL, PROMPT_VERSION } from "@/lib/insights/prompt";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  let body: { regenerate?: boolean } = {};
  try {
    body = (await req.json()) as { regenerate?: boolean };
  } catch {
    body = {};
  }

  const { data: existingRaw } = await sessionInsightsTable(supabase)
    .select("insight_markdown, model, prompt_version, input_token_count, output_token_count, generated_at")
    .eq("session_id", id)
    .maybeSingle();
  const existing = existingRaw as Pick<
    SessionInsightRow,
    "insight_markdown" | "model" | "prompt_version" | "input_token_count" | "output_token_count" | "generated_at"
  > | null;

  if (existing && !body.regenerate) {
    return NextResponse.json({
      markdown: existing.insight_markdown,
      model: existing.model,
      prompt_version: existing.prompt_version,
      input_tokens: existing.input_token_count,
      output_tokens: existing.output_token_count,
      generated_at: existing.generated_at,
      cached: true,
    });
  }

  const { data: session } = await supabase
    .from("sessions")
    .select("id, activity_type, start_time, end_time")
    .eq("id", id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [metricsRes, labelsRes] = await Promise.all([
    supabase.from("session_metrics").select("*").eq("session_id", id).maybeSingle(),
    supabase
      .from("label_corrections")
      .select(
        "auto_start_ms, auto_end_ms, auto_label_type, corrected_start_ms, corrected_end_ms, corrected_label_type, corrected_jump_count",
      )
      .eq("session_id", id),
  ]);

  const metrics = (metricsRes.data ?? null) as Record<string, unknown> | null;
  const input = buildInsightInput(session, metrics, (labelsRes.data ?? []) as RawLabelRow[]);

  let result;
  try {
    result = await generateInsight(buildInsightPrompt(input));
  } catch (err) {
    console.error("insight_generation_failed " + JSON.stringify({ id, err: String(err) }));
    return NextResponse.json(
      { error: "insight_generation_failed", detail: String(err) },
      { status: 502 },
    );
  }

  const { data: upserted, error: upsertErr } = await sessionInsightsTable(supabase)
    .upsert(
      {
        session_id: id,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        insight_markdown: result.markdown,
        input_token_count: result.input_tokens,
        output_token_count: result.output_tokens,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "session_id" },
    )
    .select("generated_at")
    .maybeSingle();
  const upsertedRow = upserted as { generated_at: string } | null;

  if (upsertErr) {
    console.error("insight_upsert_failed " + JSON.stringify({ id, err: upsertErr }));
    return NextResponse.json({ error: "upsert_failed" }, { status: 500 });
  }

  return NextResponse.json({
    markdown: result.markdown,
    model: MODEL,
    prompt_version: PROMPT_VERSION,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    generated_at: upsertedRow?.generated_at ?? new Date().toISOString(),
    cached: false,
  });
}
