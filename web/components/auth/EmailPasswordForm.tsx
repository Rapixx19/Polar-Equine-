"use client";

import Link from "next/link";
import { useState } from "react";

export function EmailPasswordForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validPassword = password.length >= 6;
  const canSubmit = validEmail && validPassword && !submitting;

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
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--lime)] focus:outline-none"
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
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--lime)] focus:outline-none"
        />
      </label>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-[var(--lime)] px-4 py-3 text-base font-medium text-[var(--canvas)] transition disabled:cursor-not-allowed disabled:bg-[var(--border)] disabled:text-[var(--text-faint)]"
      >
        {submitting ? "Signing in…" : "Continue"}
      </button>

      {error && <p className="text-sm text-[var(--red)]">{error}</p>}

      <p className="text-xs text-[var(--text-faint)]">
        Don&apos;t have an account yet? Accounts are created by the admin —
        reach out and we&apos;ll set you up.
      </p>

      <p className="text-xs text-[var(--text-faint)]">
        Forgot your password?{" "}
        <Link
          href="/auth/forgot"
          className="underline underline-offset-2 hover:text-[var(--lime)]"
        >
          Reset it
        </Link>
        .
      </p>
    </form>
  );
}
