"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EmailInput() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = validEmail && consent && !submitting;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, consented: true }),
      });
      if (!res.ok) {
        setError("Couldn't send link, try again.");
        setSubmitting(false);
        return;
      }
      router.push(`/auth/sent?email=${encodeURIComponent(email)}`);
    } catch {
      setError("Network error. Check your connection.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <label className="block">
        <span className="sr-only">email</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-stone-300 bg-white px-4 py-3 text-base text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none"
        />
      </label>

      <label className="flex cursor-pointer items-start gap-3 text-sm text-stone-700">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-stone-400"
        />
        <span>
          I consent to my anonymized session data being used for equine welfare research.
        </span>
      </label>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-stone-900 px-4 py-3 text-base font-medium text-white transition disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {submitting ? "Sending…" : "Send magic link"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
