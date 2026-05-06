export const ACTIVITY_TYPES = [
  "riding",
  "lunging",
  "grass_field",
  "walker",
  "stall",
  "transport",
  "vet",
  "other",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const RIDING_SUBTYPES = [
  "flat_work",
  "light_jumping",
  "heavy_jumping",
  "cross_country",
  "hack",
  "other",
] as const;

export type RidingSubtype = (typeof RIDING_SUBTYPES)[number];

export const RIDING_SUBTYPE_UI: Record<RidingSubtype, { label: string; desc: string }> = {
  flat_work: { label: "Flat work", desc: "Schooling, dressage, no jumps" },
  light_jumping: { label: "Light jumping", desc: "Gymnastics, cavaletti, low fences" },
  heavy_jumping: { label: "Heavy jumping", desc: "Course work, competition fences" },
  cross_country: { label: "Cross-country", desc: "XC schooling or competition" },
  hack: { label: "Hack", desc: "Relaxed riding outside the arena" },
  other: { label: "Other", desc: "Polo, trail, or something else" },
};

// SVG `d` paths copied verbatim from the locked mockup
// (`lafattoria_d3_complete.html` lines 318-345). Re-traced icons would drift;
// the spec freezes these.
export const RIDING_SUBTYPE_ICONS: Record<RidingSubtype, string> = {
  flat_work: "M3 18h18M5 14h14M7 10h10M9 6h6",
  light_jumping: "M3 18h4l3-7 4 5 3-3h4",
  heavy_jumping: "M3 19h3l3-12 3 9 3-6 3 5h3",
  cross_country: "M3 14l4-4 4 6 4-8 6 6",
  hack: "M3 12c4 0 6-4 9-4s5 8 9 8",
  other: "M9 9h.01M15 9h.01M9 15c1 1 5 1 6 0",
};

// `cross_country` and `other` icons in the mockup also include a second SVG
// element (a circle). Stage 4 will render that as a separate element; the
// path here is the primary stroke shared by all six.
