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
        <p className="text-stone-700">
          If an account exists for{" "}
          <span className="font-medium">{email}</span>, we&apos;ve sent a reset
          link. Check your inbox.
        </p>
        <p className="text-sm text-stone-500">
          The link works once and expires in 1 hour.
        </p>
        <Link
          href="/"
          className="inline-block text-sm text-stone-700 underline underline-offset-4 hover:text-stone-900"
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
          className="w-full rounded-md border border-stone-300 bg-white px-4 py-3 text-base text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none"
        />
      </label>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-stone-900 px-4 py-3 text-base font-medium text-white transition disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {submitting ? "Sending…" : "Send reset link"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <p className="text-xs text-stone-500">
        <Link
          href="/"
          className="underline underline-offset-2 hover:text-stone-700"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
