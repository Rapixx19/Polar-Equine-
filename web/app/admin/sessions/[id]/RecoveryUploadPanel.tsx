"use client";

import { useState } from "react";

type UploadResult = {
  ok: boolean;
  inserted: number;
  skipped: number;
  enqueued: boolean;
  parse_errors?: string[];
};

export function RecoveryUploadPanel({ sessionId }: { sessionId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/sessions/${sessionId}/recovery-upload`, {
        method: "POST",
        body: form,
      });
      const body = (await res.json()) as UploadResult & { error?: string; message?: string };
      if (!res.ok) {
        setError(body.error ?? body.message ?? `http_${res.status}`);
      } else {
        setResult(body);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-[var(--text-muted)]">Recovery upload</h2>
      <div className="space-y-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <p className="text-xs text-[var(--text-faint)]">
          CSV with columns <code>timestamp_ms,hr_bpm,rr_ms</code> (rr_ms optional). Inserts raw,
          de-dupes by timestamp, then re-runs compute. Use only when the live capture crashed.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              setResult(null);
              setError(null);
            }}
            className="text-xs text-[var(--text-muted)] file:mr-3 file:rounded-full file:border file:border-[var(--border)] file:bg-[var(--surface-2)] file:px-3 file:py-1 file:text-[var(--text)]"
          />
          <button
            type="button"
            disabled={!file || busy}
            onClick={() => void upload()}
            className="rounded-full border border-[var(--lime)]/60 bg-[var(--lime)]/10 px-4 py-1.5 text-xs uppercase tracking-wide text-[var(--lime)] disabled:opacity-40"
          >
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
        {error && (
          <p className="text-xs text-[var(--red)]">Error: {error}</p>
        )}
        {result && (
          <div className="text-xs text-[var(--text-muted)]">
            Inserted <span className="text-[var(--text)]">{result.inserted}</span> · skipped{" "}
            <span className="text-[var(--text)]">{result.skipped}</span> ·{" "}
            {result.enqueued ? "compute enqueued" : "compute NOT enqueued"}
            {result.parse_errors && result.parse_errors.length > 0 && (
              <div className="mt-1 text-amber-600">
                {result.parse_errors.length} parse warnings: {result.parse_errors.slice(0, 3).join(", ")}
                {result.parse_errors.length > 3 ? "…" : ""}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
