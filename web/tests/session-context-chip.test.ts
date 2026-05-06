import { describe, expect, it } from "vitest";

import { buildChipParts } from "@/components/session/SessionContextChip";

describe("SessionContextChip / buildChipParts", () => {
  it("returns activity-only when no subtype/note", () => {
    expect(buildChipParts("stall", null, null)).toEqual(["Stall"]);
  });

  it("returns activity + subtype label for riding", () => {
    expect(buildChipParts("riding", "heavy_jumping", null)).toEqual([
      "Riding",
      "Heavy jumping",
    ]);
  });

  it("returns activity + subtype label for lunging", () => {
    expect(buildChipParts("lunging", "flat_work", null)).toEqual([
      "Lunging",
      "Flat work",
    ]);
  });

  it("returns activity + note for 'other'", () => {
    expect(buildChipParts("other", null, "Polo match")).toEqual([
      "Other",
      "Polo match",
    ]);
  });

  it("clamps long notes with an ellipsis", () => {
    const longNote = "a".repeat(80);
    const [, displayed] = buildChipParts("other", null, longNote);
    expect(displayed).toBeDefined();
    expect(displayed!.endsWith("…")).toBe(true);
    expect(displayed!.length).toBeLessThan(longNote.length);
  });

  it("trims whitespace and skips empty notes", () => {
    expect(buildChipParts("other", null, "   ")).toEqual(["Other"]);
  });

  it("ignores subtype on non-riding/lunging activity", () => {
    // Defensive: even if a stale subtype slips through (e.g. URL fiddle),
    // the chip MUST NOT advertise it for stall/transport/etc.
    expect(buildChipParts("stall", "heavy_jumping", null)).toEqual(["Stall"]);
    expect(buildChipParts("vet", "flat_work", null)).toEqual(["Vet"]);
  });

  it("ignores note on non-'other' activity", () => {
    expect(buildChipParts("riding", "heavy_jumping", "should be ignored")).toEqual([
      "Riding",
      "Heavy jumping",
    ]);
  });
});
