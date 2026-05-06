// Generic single-letter avatar circle. Used for the rider profile dot in the
// home top-row. Slice 11.8 Stage 4 introduces HorseAvatar with a deterministic
// color palette; this primitive stays palette-agnostic.
export function Avatar({
  initial,
  size = "md",
}: {
  initial: string;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "h-8 w-8 text-sm" : "h-9 w-9 text-base";
  return (
    <span
      aria-hidden
      className={`flex ${sizeClass} items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] font-medium text-[var(--text)]`}
    >
      {initial}
    </span>
  );
}
