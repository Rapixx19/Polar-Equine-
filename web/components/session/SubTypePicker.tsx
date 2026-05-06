// 6-row sub-type picker shared by riding and lunging. Server component —
// each option is a Link that forwards the chosen subtype into the horse
// picker via URL params (`/start/horse?activity=...&subtype=...`).
// SVG `d` paths come from RIDING_SUBTYPE_ICONS (locked to mockup
// `lafattoria_d3_complete.html:318-345`).
import Link from "next/link";

import {
  RIDING_SUBTYPES,
  RIDING_SUBTYPE_ICONS,
  RIDING_SUBTYPE_UI,
  type ActivityType,
  type RidingSubtype,
} from "@/lib/activities";

// `cross_country` and `other` icons in the mockup include a circle in
// addition to the primary path. Adding it here keeps Stage 4 visually
// faithful without forcing the icons map to grow into a discriminated
// union (Stage 5 may revisit if more icons need a second element).
const SECONDARY_ICONS: Partial<Record<RidingSubtype, { cx: number; cy: number; r: number }>> = {
  cross_country: { cx: 20, cy: 20, r: 2 },
};

export function SubTypePicker({ activity }: { activity: ActivityType }) {
  return (
    <div className="space-y-3">
      {RIDING_SUBTYPES.map((subtype) => {
        const { label, desc } = RIDING_SUBTYPE_UI[subtype];
        const path = RIDING_SUBTYPE_ICONS[subtype];
        const secondary = SECONDARY_ICONS[subtype];
        return (
          <Link
            key={subtype}
            href={`/start/horse?activity=${activity}&subtype=${subtype}`}
            className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--lime)] active:bg-[var(--canvas)]"
          >
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--canvas)] text-[var(--lime)]"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 fill-none stroke-current"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={path} />
                {subtype === "other" && (
                  <circle cx="12" cy="12" r="9" />
                )}
                {secondary && (
                  <circle cx={secondary.cx} cy={secondary.cy} r={secondary.r} />
                )}
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text)]">{label}</p>
              <p className="text-xs text-[var(--text-muted)]">{desc}</p>
            </div>
            <span aria-hidden className="text-lg text-[var(--text-faint)]">
              ›
            </span>
          </Link>
        );
      })}
    </div>
  );
}
