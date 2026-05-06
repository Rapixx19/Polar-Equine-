"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProvisionForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= 80 && !submitting;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/provision-rider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ display_name: trimmed }),
      });
      if (!res.ok) {
        setError("Couldn't save, try again.");
        setSubmitting(false);
        return;
      }
      router.replace("/home");
    } catch {
      setError("Network error. Check your connection.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm text-[var(--text-muted)]">Display name</span>
        <input
          type="text"
          autoComplete="name"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--lime)] focus:outline-none"
        />
      </label>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-[var(--lime)] px-4 py-3 text-base font-medium text-[var(--canvas)] transition disabled:cursor-not-allowed disabled:bg-[var(--border)] disabled:text-[var(--text-faint)]"
      >
        {submitting ? "Saving…" : "Continue"}
      </button>

      {error && <p className="text-sm text-[var(--red)]">{error}</p>}
    </form>
  );
}
