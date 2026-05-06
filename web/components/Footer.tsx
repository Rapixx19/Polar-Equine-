// Footer nav placeholder for Slice 11.8. Both items render visually but
// are inert (aria-disabled, no-op onClick). Real "All sessions" + "Settings"
// pages land in a later slice.
"use client";

export function Footer() {
  return (
    <footer className="mt-10 flex justify-center gap-8 border-t border-[var(--border)] pt-4 text-sm text-[var(--text-faint)]">
      <button
        type="button"
        aria-disabled="true"
        onClick={(e) => e.preventDefault()}
        className="cursor-not-allowed transition hover:text-[var(--text-muted)]"
      >
        All sessions
      </button>
      <button
        type="button"
        aria-disabled="true"
        onClick={(e) => e.preventDefault()}
        className="cursor-not-allowed transition hover:text-[var(--text-muted)]"
      >
        Settings
      </button>
    </footer>
  );
}
