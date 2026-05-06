"use client";

import Link from "next/link";
import { useState } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit = validEmail && !submitting;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setError("Couldn't send reset email. Try again.");
        setSubmitting(false);
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Check your connection.");
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="text-[var(--text)]">
          If an account exists for{" "}
          <span className="font-medium">{email}</span>, we&apos;ve sent a reset
          link. Check your inbox.
        </p>
        <p className="text-sm text-[var(--text-faint)]">
          The link works once and expires in 1 hour.
        </p>
        <Link
          href="/"
          className="inline-block text-sm text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--lime)]"
        >
          Back to sign in
        </Link>
      </div>
    );
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
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--lime)] focus:outline-none"
        />
      </label>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-[var(--lime)] px-4 py-3 text-base font-medium text-[var(--canvas)] transition disabled:cursor-not-allowed disabled:bg-[var(--border)] disabled:text-[var(--text-faint)]"
      >
        {submitting ? "Sending…" : "Send reset link"}
      </button>

      {error && <p className="text-sm text-[var(--red)]">{error}</p>}

      <p className="text-xs text-[var(--text-faint)]">
        <Link
          href="/"
          className="underline underline-offset-2 hover:text-[var(--lime)]"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
