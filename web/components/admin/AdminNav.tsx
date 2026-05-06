"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/admin/horses", label: "Horses" },
  { href: "/admin/jobs", label: "Jobs" },
] as const;

export function AdminNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex gap-1 overflow-x-auto whitespace-nowrap text-sm">
      {NAV_ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "rounded-md bg-[var(--surface)] px-3 py-1.5 text-[var(--lime)]"
                : "rounded-md px-3 py-1.5 text-[var(--text-muted)] hover:text-[var(--text)]"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
