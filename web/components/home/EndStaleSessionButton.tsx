"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  id: string;
  variant: "subtle" | "warn";
};

export function EndStaleSessionButton({ id, variant }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function end() {
    setError(null);
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "end" }),
    }).catch(() => null);
    if (!res || (!res.ok && res.status !== 409)) {
      setError("Could not end session");
      return;
    }
    startTransition(() => router.refresh());
  }

  const base =
    "rounded-md border px-2.5 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-60";
  const cls =
    variant === "warn"
      ? `${base} border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20`
      : `${base} border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--text)]`;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void end()}
        disabled={pending}
        className={cls}
      >
        {pending ? "Ending…" : "End now"}
      </button>
      {error && <span className="text-[10px] text-[var(--red)]">{error}</span>}
    </div>
  );
}
