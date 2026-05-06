"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX = 200;

export function CustomActivityForm() {
  const router = useRouter();
  const [note, setNote] = useState("");
  const trimmed = note.trim();
  const tooLong = note.length > MAX;
  const disabled = trimmed.length === 0 || tooLong;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return;
    router.push(`/start/horse?activity=other&note=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="activity-note"
          className="mb-2 block text-xs uppercase tracking-wide text-[var(--text-faint)]"
        >
          What is this session?
        </label>
        <textarea
          id="activity-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={MAX + 50}
          placeholder="Polo match — practice game"
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-base text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--lime)] focus:outline-none"
          autoFocus
        />
        <div className="mt-2 flex items-start justify-between gap-3">
          <p className="text-xs text-[var(--text-muted)]">
            A few words is enough. This text is only for your records — it won&rsquo;t change how data is processed.
          </p>
          <p
            className={`shrink-0 text-xs ${tooLong ? "text-[var(--red)]" : "text-[var(--text-faint)]"}`}
          >
            {note.length}/{MAX}
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={disabled}
        className="w-full rounded-2xl bg-[var(--lime)] px-4 py-3 text-base font-medium text-[var(--canvas)] transition disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continue
      </button>
    </form>
  );
}
