import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/BrandMark";
import { AdminNav } from "@/components/admin/AdminNav";

type Props = {
  displayName: string | null;
  children: ReactNode;
};

export function AdminShell({ displayName, children }: Props) {
  const adminLabel = displayName?.trim() ? displayName : "admin";
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <BrandMark />
          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
            <span>
              Admin <span aria-hidden>·</span> {adminLabel}
            </span>
            <Link
              href="/home"
              className="rounded-md border border-[var(--border)] px-2 py-1 hover:text-[var(--text)]"
            >
              Rider home
            </Link>
          </div>
        </header>

        <div className="mb-6 border-b border-[var(--border)] pb-3">
          <AdminNav />
        </div>

        {children}
      </div>
    </main>
  );
}
