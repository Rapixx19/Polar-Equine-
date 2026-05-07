import { describe, expect, it } from "vitest";

import { mapSessionToResearchLabel, RESEARCH_LABELS } from "@/lib/admin/study-mapping";

describe("mapSessionToResearchLabel", () => {
  it.each([
    ["walker", null, "A-Walk"],
    ["stall", null, "A-Rest"],
    ["transport", null, "A-Rest"],
    ["vet", null, "A-Rest"],
    ["riding", "flat_work", "C-Mixed"],
    ["riding", "hack", "C-Mixed"],
    ["riding", "other", "C-Mixed"],
    ["riding", null, "C-Mixed"],
    ["riding", "light_jumping", "D-Jumping"],
    ["riding", "heavy_jumping", "D-Jumping"],
    ["riding", "cross_country", "D-Jumping"],
    ["lunging", null, "E-Context"],
    ["grass_field", null, "E-Context"],
    ["other", null, null],
    ["unknown_activity", null, null],
    [null, null, null],
    [undefined, undefined, null],
  ] as const)("(%s, %s) → %s", (activity, subtype, expected) => {
    expect(mapSessionToResearchLabel(activity, subtype)).toBe(expected);
  });

  it("RESEARCH_LABELS is the 9 documented categories in order", () => {
    expect(RESEARCH_LABELS).toEqual([
      "A-Walk",
      "A-Trot",
      "A-Canter",
      "A-Gallop",
      "A-Rest",
      "B-Transitions",
      "C-Mixed",
      "D-Jumping",
      "E-Context",
    ]);
  });
});
