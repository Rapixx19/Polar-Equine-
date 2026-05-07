"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/study/roster", label: "Roster" },
  { href: "/admin/study/horses", label: "Horses" },
  { href: "/admin/study/allocation", label: "Allocation" },
] as const;

export function StudyTabs() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-[var(--border)] pb-2 text-sm">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              active
                ? "rounded-md bg-[var(--surface)] px-3 py-1.5 text-[var(--lime)]"
                : "rounded-md px-3 py-1.5 text-[var(--text-muted)] hover:text-[var(--text)]"
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
