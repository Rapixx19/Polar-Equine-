"use client";

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
};

// Pre-recording opt-in for the experimental girth-mount holder. Flag travels
// with the session row so admin can later compare quality between baseline
// (bare strap) and prototype-mount setups. Data collection itself is identical.
export function PrototypeMountToggle({ checked, onChange, disabled = false }: Props) {
  return (
    <label
      className={
        "flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm transition " +
        (checked
          ? "border-[var(--lime)]/60 bg-[var(--lime)]/5"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--lime)]/40") +
        (disabled ? " cursor-not-allowed opacity-50" : "")
      }
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-[var(--lime)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block font-medium text-[var(--text)]">
          Recording with prototype mount
        </span>
        <span className="block text-xs text-[var(--text-muted)]">
          Turn on if you&apos;re using the experimental girth holder. Data is captured the
          same way — this just tags the session so we can compare quality later.
        </span>
      </span>
    </label>
  );
}
