// Footer nav. Slice 12.D wired both items to real (stub) routes; the full
// pages ship in a later slice but the links are no longer dead buttons.
import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-10 flex justify-center gap-8 border-t border-[var(--border)] pt-4 text-sm text-[var(--text-faint)]">
      <Link href="/sessions" className="transition hover:text-[var(--text-muted)]">
        All sessions
      </Link>
      <Link href="/settings" className="transition hover:text-[var(--text-muted)]">
        Settings
      </Link>
    </footer>
  );
}
