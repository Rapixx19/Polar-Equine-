"use client";

import Link from "next/link";
import { useState } from "react";

export function EmailPasswordForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validPassword = password.length >= 6;
  const canSubmit = validEmail && validPassword && consent && !submitting;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError("Couldn't sign in. Check email and password.");
        setSubmitting(false);
        return;
      }
      window.location.href = "/home";
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

      <label className="block">
        <span className="sr-only">password</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
          placeholder="password (≥6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
          I consent to my anonymized session data being used for equine welfare
          research.
        </span>
      </label>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-stone-900 px-4 py-3 text-base font-medium text-white transition disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {submitting ? "Signing in…" : "Continue"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <p className="text-xs text-stone-500">
        Don&apos;t have an account yet? Accounts are created by the study admin
        — reach out and we&apos;ll set you up.
      </p>

      <p className="text-xs text-stone-500">
        Forgot your password?{" "}
        <Link
          href="/auth/forgot"
          className="underline underline-offset-2 hover:text-stone-700"
        >
          Reset it
        </Link>
        .
      </p>
    </form>
  );
}
