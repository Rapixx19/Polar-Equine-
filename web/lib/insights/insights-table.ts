// Local typed wrapper for `session_insights` until the generated
// Supabase types are regenerated post-migration 027. Replace direct
// usage with the regenerated types after applying the migration.

export type SessionInsightRow = {
  id: string;
  session_id: string;
  model: string;
  prompt_version: string;
  insight_markdown: string;
  input_token_count: number;
  output_token_count: number;
  generated_at: string;
};

export type SessionInsightUpsert = Omit<SessionInsightRow, "id">;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sessionInsightsTable(supabase: unknown): any {
  // The generated types do not yet include `session_insights`. Once
  // migration 027 is applied and `pnpm gen:types` is run, this helper
  // can be deleted in favour of typed `.from("session_insights")`.
  return (supabase as { from: (t: string) => unknown }).from("session_insights");
}
