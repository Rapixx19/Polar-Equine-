"use client";

import { useState, useTransition } from "react";

type InsightResponse = {
  markdown: string;
  model: string;
  prompt_version: string;
  input_tokens: number;
  output_tokens: number;
  generated_at: string;
  cached: boolean;
};

export function InsightPanel({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: InsightResponse | null;
}) {
  const [insight, setInsight] = useState<InsightResponse | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trigger = (regenerate: boolean) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/sessions/${sessionId}/insights`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ regenerate }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? `request_failed_${res.status}`);
          return;
        }
        const body = (await res.json()) as InsightResponse;
        setInsight(body);
      } catch (e) {
        setError(String(e));
      }
    });
  };

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-[var(--text-muted)]">Session insight</h2>
        <div className="flex items-center gap-2">
          {insight ? (
            <button
              type="button"
              onClick={() => trigger(true)}
              disabled={pending}
              className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--lime)] hover:text-[var(--lime)] disabled:opacity-50"
            >
              {pending ? "Regenerating…" : "Regenerate"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => trigger(false)}
              disabled={pending}
              className="rounded-md border border-[var(--lime)] px-2.5 py-1 text-xs text-[var(--lime)] hover:bg-[var(--lime)] hover:text-[var(--canvas)] disabled:opacity-50"
            >
              {pending ? "Generating…" : "Generate insight"}
            </button>
          )}
        </div>
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
          No insight generated yet. Generating sends session metrics + label rollup to Claude
          (no raw HR samples, no names).
        </p>
      )}
    </section>
  );
}
