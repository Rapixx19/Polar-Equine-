"use client";

import { useState, useTransition } from "react";

export type PrototypeInsight = {
  id: string;
  generated_at: string;
  model: string;
  prompt_version: string;
  markdown: string;
  input_tokens: number;
  output_tokens: number;
  baseline_session_count: number;
  prototype_session_count: number;
};

export function PrototypeInsightClient({
  initial,
  liveBaselineCount,
  livePrototypeCount,
}: {
  initial: PrototypeInsight | null;
  liveBaselineCount: number;
  livePrototypeCount: number;
}) {
  const [insight, setInsight] = useState<PrototypeInsight | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trigger = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/prototype/insight", { method: "POST" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
          setError(body.detail ?? body.error ?? `request_failed_${res.status}`);
          return;
        }
        const body = (await res.json()) as PrototypeInsight;
        setInsight(body);
      } catch (e) {
        setError(String(e));
      }
    });
  };

  const stale =
    insight !== null &&
    (insight.baseline_session_count !== liveBaselineCount ||
      insight.prototype_session_count !== livePrototypeCount);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-[var(--text-muted)]">Claude verdict</h2>
          {insight && (
            <p className="mt-0.5 text-xs text-[var(--text-faint)]">
              Generated against baseline={insight.baseline_session_count}, prototype=
              {insight.prototype_session_count}. Live now: baseline={liveBaselineCount}, prototype=
              {livePrototypeCount}.{stale && " — corpus has shifted, consider regenerating."}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={trigger}
          disabled={pending}
          className={
            insight
              ? "rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--lime)] hover:text-[var(--lime)] disabled:opacity-50"
              : "rounded-md border border-[var(--lime)] px-2.5 py-1 text-xs text-[var(--lime)] hover:bg-[var(--lime)] hover:text-[var(--canvas)] disabled:opacity-50"
          }
        >
          {pending ? (insight ? "Regenerating…" : "Generating…") : insight ? "Regenerate" : "Generate verdict"}
        </button>
      </div>

      {error ? (
        <p className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      ) : null}

      {insight ? (
        <>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--text)]">
            {insight.markdown}
          </pre>
          <p className="mt-3 text-xs text-[var(--text-faint)]">
            {insight.model} · {insight.prompt_version} · {insight.input_tokens} in /{" "}
            {insight.output_tokens} out · generated {new Date(insight.generated_at).toLocaleString()}
          </p>
        </>
      ) : (
        <p className="text-sm text-[var(--text-faint)]">
          No comparison yet. Generating sends per-bucket quality aggregates to Claude (no per-session
          data, no rider names) and asks for a short verdict — better, worse, or about the same.
        </p>
      )}
    </section>
  );
}
