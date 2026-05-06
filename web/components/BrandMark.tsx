// Heart-spike SVG mark + wordmark, copied from the D3 mockup
// (`lafattoria_d3_complete.html` line 211). Server component.
export function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--surface)] text-[var(--lime)]"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 17l3-7 3 4 4-8 4 11" />
        </svg>
      </span>
      <span className="text-sm font-medium tracking-wide text-[var(--text)]">La Fattoria</span>
    </div>
  );
}
