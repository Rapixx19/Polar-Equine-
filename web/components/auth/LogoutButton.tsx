"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-muted)] transition hover:border-[var(--lime)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? "Logging out…" : "Log out"}
    </button>
  );
}
