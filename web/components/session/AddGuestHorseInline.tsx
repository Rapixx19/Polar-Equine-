"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// V0.2: inline form for adding a one-off / guest horse from the start
// session picker. Distinct from AddHorseDialog because guest creation is
// the common-case flow (rider lands on a horse they don't own) and a modal
// adds friction. A successful submit refreshes the server component so the
// new tile appears in "Recent one-time horses" immediately.

const MAX = 80;
type Phase = "idle" | "submitting";

export function AddGuestHorseInline() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const tooLong = name.length > MAX;
  const disabled = phase === "submitting" || trimmed.length === 0 || tooLong;

  function reset() {
    setOpen(false);
    setName("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return;
    setPhase("submitting");
    setError(null);
    try {
      const res = await fetch("/api/horses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed, is_guest: true }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(messageFor(j?.error ?? "create_failed"));
        setPhase("idle");
        return;
      }
      reset();
      setPhase("idle");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setPhase("idle");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-2xl border border-dashed border-[var(--border)] bg-transparent px-4 py-3 text-sm text-[var(--text-muted)] transition hover:border-[var(--lime)] hover:text-[var(--text)]"
      >
        + Add one-time horse
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <label
        htmlFor="guest-horse-name"
        className="mb-2 block text-xs uppercase tracking-wide text-[var(--text-faint)]"
      >
        One-time horse
      </label>
      <input
        id="guest-horse-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX + 20}
        placeholder="Name"
        autoFocus
        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--canvas)] p-3 text-base text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--lime)] focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-muted)]">
          Saved as a one-off so it stays out of your main list.
        </p>
        <p
          className={`shrink-0 text-xs ${tooLong ? "text-[var(--red)]" : "text-[var(--text-faint)]"}`}
        >
          {name.length}/{MAX}
        </p>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--red)]">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={phase === "submitting"}
          className="flex-1 rounded-2xl border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={disabled}
          className="flex-1 rounded-2xl bg-[var(--lime)] px-3 py-2 text-sm font-medium text-[var(--canvas)] transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {phase === "submitting" ? "Saving…" : "Add horse"}
        </button>
      </div>
    </form>
  );
}

function messageFor(code: string): string {
  switch (code) {
    case "unauthorized":
      return "Please sign in again.";
    case "invalid_request":
      return "Name must be 1–80 characters.";
    case "no_rider_profile":
      return "Sign in once before creating horses.";
    default:
      return "Couldn't save the horse. Try again.";
  }
}
