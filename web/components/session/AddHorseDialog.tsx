"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX = 80;

type Phase = "idle" | "submitting";

export function AddHorseDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const tooLong = name.length > MAX;
  const disabled = phase === "submitting" || trimmed.length === 0 || tooLong;

  function close() {
    if (phase === "submitting") return;
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
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        const code = json?.error ?? "create_failed";
        setError(messageFor(code));
        setPhase("idle");
        return;
      }
      // refresh() re-runs the server component so the new horse shows in the list.
      setOpen(false);
      setName("");
      setPhase("idle");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setPhase("idle");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-2xl border border-dashed border-[var(--border)] bg-transparent px-4 py-4 text-sm text-[var(--text-muted)] transition hover:border-[var(--lime)] hover:text-[var(--text)]"
      >
        + Add a new horse
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add a new horse"
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center"
          onClick={close}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-light text-[var(--text)]">Add a horse</h2>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="horse-name"
                  className="mb-2 block text-xs uppercase tracking-wide text-[var(--text-faint)]"
                >
                  Name
                </label>
                <input
                  id="horse-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={MAX + 20}
                  placeholder="Hippo"
                  autoFocus
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--canvas)] p-4 text-base text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--lime)] focus:outline-none"
                />
                <div className="mt-2 flex items-start justify-between gap-3">
                  <p className="text-xs text-[var(--text-muted)]">
                    You can add details (sex, breed, DOB) later.
                  </p>
                  <p
                    className={`shrink-0 text-xs ${tooLong ? "text-[var(--red)]" : "text-[var(--text-faint)]"}`}
                  >
                    {name.length}/{MAX}
                  </p>
                </div>
              </div>

              {error ? (
                <p role="alert" className="text-sm text-[var(--red)]">
                  {error}
                </p>
              ) : null}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={close}
                  disabled={phase === "submitting"}
                  className="flex-1 rounded-2xl border border-[var(--border)] bg-transparent px-4 py-3 text-sm text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={disabled}
                  className="flex-1 rounded-2xl bg-[var(--lime)] px-4 py-3 text-sm font-medium text-[var(--canvas)] transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {phase === "submitting" ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
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
      return "Couldn't create the horse. Try again.";
  }
}
