// Auto-map a session's existing activity_type + riding_subtype to one of the
// 9 research-protocol categories. Lossy by design — sessions that don't fit
// any category return null ("Unmapped") and surface as their own row in the
// admin allocation table.
//
// A-Trot / A-Canter / A-Gallop / B-Transitions can't be derived from current
// schema (no gait or drill-type field on `sessions`), so they read as 0 in
// 12.A. A future slice will add a rider-side gait tag + admin override flow.

export const RESEARCH_LABELS = [
  "A-Walk",
  "A-Trot",
  "A-Canter",
  "A-Gallop",
  "A-Rest",
  "B-Transitions",
  "C-Mixed",
  "D-Jumping",
  "E-Context",
] as const;

export type ResearchLabel = (typeof RESEARCH_LABELS)[number];

const JUMPING_SUBTYPES = new Set(["light_jumping", "heavy_jumping", "cross_country"]);

export function mapSessionToResearchLabel(
  activityType: string | null | undefined,
  ridingSubtype: string | null | undefined,
): ResearchLabel | null {
  if (!activityType) return null;
  switch (activityType) {
    case "walker":
      return "A-Walk";
    case "stall":
    case "transport":
    case "vet":
      return "A-Rest";
    case "lunging":
    case "grass_field":
      return "E-Context";
    case "riding":
      if (ridingSubtype && JUMPING_SUBTYPES.has(ridingSubtype)) return "D-Jumping";
      return "C-Mixed";
    default:
      return null;
  }
}
