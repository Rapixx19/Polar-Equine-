import { NextResponse } from "next/server";

import { createServerSupabaseClient, getUser } from "@/lib/auth/server";
import { generateInsight } from "@/lib/insights/anthropic-client";
import { aggregateBucket } from "@/lib/prototype/aggregate";
import { fetchBucketRows } from "@/lib/prototype/fetch-quality";
import { buildComparisonPrompt, MODEL, PROMPT_VERSION } from "@/lib/prototype/prompt";

// POST /api/admin/prototype/insight
//
// Generates a fresh Claude narrative comparing prototype-mount sessions to
// baseline. Always appends a new row to prototype_comparison_insights — the
// dataset shifts every time a session is recorded, so we don't try to cache.
// The /admin/prototype page reads the latest row and offers a button that
// hits this endpoint.

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("rider_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!me?.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let baselineRows;
  let prototypeRows;
  try {
    [baselineRows, prototypeRows] = await Promise.all([
      fetchBucketRows(supabase, false),
      fetchBucketRows(supabase, true),
    ]);
  } catch (err) {
    console.error("prototype_insight_fetch_failed " + JSON.stringify({ err: String(err) }));
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  if (prototypeRows.length === 0) {
    return NextResponse.json(
      { error: "no_prototype_sessions", detail: "Need at least one ended session with the prototype-mount flag." },
      { status: 400 },
    );
  }

  const baseline = aggregateBucket(baselineRows);
  const prototype = aggregateBucket(prototypeRows);
  const prompt = buildComparisonPrompt({ baseline, prototype });

  let result;
  try {
    result = await generateInsight(prompt);
  } catch (err) {
    console.error("prototype_insight_generation_failed " + JSON.stringify({ err: String(err) }));
    return NextResponse.json(
      { error: "insight_generation_failed", detail: String(err) },
      { status: 502 },
    );
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("prototype_comparison_insights")
    .insert({
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      insight_markdown: result.markdown,
      input_token_count: result.input_tokens,
      output_token_count: result.output_tokens,
      baseline_session_count: baseline.session_count,
      prototype_session_count: prototype.session_count,
    })
    .select("id, generated_at")
    .single();

  if (insertErr || !inserted) {
    console.error("prototype_insight_insert_failed " + JSON.stringify({ err: insertErr }));
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({
    id: inserted.id,
    generated_at: inserted.generated_at,
    model: MODEL,
    prompt_version: PROMPT_VERSION,
    markdown: result.markdown,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    baseline_session_count: baseline.session_count,
    prototype_session_count: prototype.session_count,
    aggregates: { baseline, prototype },
  });
}
