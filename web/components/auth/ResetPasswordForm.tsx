"use client";

import { useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/auth/browser";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validPassword = password.length >= 6;
  const matches = password === confirm;
  const canSubmit = validPassword && matches && !submitting;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError("Couldn't update password. Request a new reset link.");
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
        <span className="sr-only">new password</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          placeholder="new password (≥6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--lime)] focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="sr-only">confirm password</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          placeholder="confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--lime)] focus:outline-none"
        />
      </label>

      {confirm.length > 0 && !matches && (
        <p className="text-sm text-[var(--red)]">Passwords don&apos;t match.</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-[var(--lime)] px-4 py-3 text-base font-medium text-[var(--canvas)] transition disabled:cursor-not-allowed disabled:bg-[var(--border)] disabled:text-[var(--text-faint)]"
      >
        {submitting ? "Saving…" : "Set new password"}
      </button>

      {error && <p className="text-sm text-[var(--red)]">{error}</p>}
    </form>
  );
}
