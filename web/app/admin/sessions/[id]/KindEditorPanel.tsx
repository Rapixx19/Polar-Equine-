"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { findSessionKind, SESSION_KINDS } from "@/lib/session-kinds";

type Props = {
  sessionId: string;
  initialKindId: string | null;
  sessionStatus: string;
};

export function KindEditorPanel({ sessionId, initialKindId, sessionStatus }: Props) {
  const router = useRouter();
  const [kindId, setKindId] = useState<string | null>(initialKindId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const selected = findSessionKind(kindId);
  const isCompleted = sessionStatus === "completed";
  const isDirty = (kindId ?? null) !== (initialKindId ?? null);
  const canSubmit = isCompleted && selected !== null && isDirty && !busy;

  async function submit() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          kind_id: selected.id,
          activity_type: selected.activity_type,
          riding_subtype: selected.riding_subtype,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? `http_${res.status}`);
        setBusy(false);
        return;
      }
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-[var(--text-muted)]">Session kind</h2>
      <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        {!isCompleted && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700">
            Session must be completed before its kind can be set. End it first.
          </p>
        )}
        <p className="text-xs text-[var(--text-faint)]">
          Re-finalizing also re-runs compute, so HR zones reflect the new kind&apos;s
          activity_type / riding_subtype within ~30 s.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SESSION_KINDS.map((kind) => {
            const isSelected = kind.id === kindId;
            return (
              <button
                key={kind.id}
                type="button"
                disabled={!isCompleted || busy}
                onClick={() => setKindId(kind.id)}
                aria-pressed={isSelected}
                className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  isSelected
                    ? "border-[var(--lime)] bg-[var(--lime)]/10"
                    : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--text-faint)]"
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {kind.emoji}
                </span>
                <span className="text-xs font-medium">{kind.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--text-muted)]">
            {selected
              ? <>Selected: <span className="text-[var(--text)]">{selected.label}</span> ({selected.activity_type}{selected.riding_subtype ? ` · ${selected.riding_subtype}` : ""})</>
              : "No kind selected yet."}
          </p>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="rounded-full border border-[var(--lime)]/60 bg-[var(--lime)]/10 px-4 py-1.5 text-xs uppercase tracking-wide text-[var(--lime)] disabled:opacity-40"
          >
            {busy ? "Saving…" : isDirty ? "Save and recompute" : "Saved"}
          </button>
        </div>
        {error && <p className="text-xs text-[var(--red)]">Error: {error}</p>}
        {savedAt && !error && (
          <p className="text-xs text-[var(--lime)]">Saved at {savedAt}. Compute dispatched.</p>
        )}
      </div>
    </section>
  );
}
