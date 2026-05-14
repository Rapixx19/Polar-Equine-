"use client";

import { useState } from "react";

import type { SourceCounts } from "./DataSourcesPanel";

type StreamDef = { key: "hr" | "acc" | "ecg" | "labels" | "label_corrections" | "metrics"; label: string; countKey: keyof SourceCounts };
const STREAMS: StreamDef[] = [
  { key: "hr", label: "HR", countKey: "samples_hr" },
  { key: "acc", label: "ACC", countKey: "samples_acc" },
  { key: "ecg", label: "ECG", countKey: "samples_ecg" },
  { key: "labels", label: "Labels", countKey: "labels_auto" },
  { key: "label_corrections", label: "Corrections", countKey: "label_corrections" },
  { key: "metrics", label: "Metrics", countKey: "session_metrics" },
];

export function ExportsPanel({
  sessionId,
  counts,
}: {
  sessionId: string;
  counts: SourceCounts;
}) {
  const [includeAcc, setIncludeAcc] = useState(false);
  const [includeEcg, setIncludeEcg] = useState(false);
  const tokens = [includeAcc ? "acc" : null, includeEcg ? "ecg" : null].filter(Boolean).join(",");
  const rawHref = tokens
    ? `/api/admin/sessions/${sessionId}/export-raw?include=${tokens}`
    : `/api/admin/sessions/${sessionId}/export-raw`;
  const accCount = counts.samples_acc;
  const ecgCount = counts.samples_ecg;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="mb-1 text-sm font-medium text-[var(--text-muted)]">Exports</h2>
      <p className="mb-3 text-xs text-[var(--text-faint)]">
        All exports replace rider/horse with pseudonyms (Rider-A, Horse-A) and omit free-text notes.
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/admin/sessions/${sessionId}/export`}
          className="inline-flex items-center rounded-md border border-[var(--lime)] px-3 py-1.5 text-sm text-[var(--lime)] hover:bg-[var(--lime)] hover:text-[var(--canvas)]"
        >
          Curated bundle JSON
        </a>
        <a
          href={rawHref}
          className="inline-flex items-center rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:border-[var(--lime)] hover:text-[var(--lime)]"
        >
          Raw bundle JSON
        </a>
      </div>
      <div className="mt-3 space-y-2 text-xs text-[var(--text-faint)]">
        <p>
          <strong className="text-[var(--text-muted)]">Raw-bundle PMD payloads</strong> (ACC + ECG) are
          omitted by default — codec is fresh (Slice 12) and rows haven&apos;t been validated on a
          horse yet. Manifest row counts always honest.
        </p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={includeAcc} onChange={(e) => setIncludeAcc(e.target.checked)} disabled={accCount === 0} className="accent-[var(--lime)]" />
          <span className={accCount === 0 ? "text-[var(--text-faint)]" : "text-[var(--text-muted)]"}>
            Include <code>samples_acc</code> ({accCount.toLocaleString()} rows)
          </span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={includeEcg} onChange={(e) => setIncludeEcg(e.target.checked)} disabled={ecgCount === 0} className="accent-[var(--lime)]" />
          <span className={ecgCount === 0 ? "text-[var(--text-faint)]" : "text-[var(--text-muted)]"}>
            Include <code>samples_ecg</code> ({ecgCount.toLocaleString()} rows)
          </span>
        </label>
      </div>
      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Per-stream
        </h3>
        <p className="mb-2 text-xs text-[var(--text-faint)]">
          One JSON per measure. Same pseudonyms, no PII. Disabled when zero rows.
        </p>
        <div className="flex flex-wrap gap-2">
          {STREAMS.map((s) => {
            const rowCount = counts[s.countKey];
            const empty = rowCount === 0;
            const href = `/api/admin/sessions/${sessionId}/export-raw?stream=${s.key}`;
            return (
              <a
                key={s.key}
                href={empty ? undefined : href}
                aria-disabled={empty}
                className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs ${
                  empty
                    ? "cursor-not-allowed border-[var(--border)] text-[var(--text-faint)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--lime)] hover:text-[var(--lime)]"
                }`}
              >
                {s.label} {empty ? "(0)" : `(${rowCount.toLocaleString()})`}
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
