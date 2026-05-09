import { describe, expect, it } from "vitest";

import { autoRouteUrl, buildSessionStartUrl, type HorseOption } from "@/lib/horses/server";

const HORSE_A: HorseOption = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Hippo" };
const HORSE_B: HorseOption = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Demo" };

describe("buildSessionStartUrl", () => {
  it("encodes activity + horse_id + subtype for riding", () => {
    const url = buildSessionStartUrl({
      activity: "riding",
      horseId: HORSE_A.id,
      subtype: "flat_work",
    });
    expect(url).toBe(
      `/session/new?activity=riding&horse_id=${HORSE_A.id}&subtype=flat_work`,
    );
  });

  it("encodes activity + horse_id + note for 'other'", () => {
    const url = buildSessionStartUrl({
      activity: "other",
      horseId: HORSE_A.id,
      note: "Polo match",
    });
    // URLSearchParams encodes spaces as '+'.
    expect(url).toBe(
      `/session/new?activity=other&horse_id=${HORSE_A.id}&note=Polo+match`,
    );
  });

  it("omits subtype and note when not provided", () => {
    const url = buildSessionStartUrl({
      activity: "stall",
      horseId: HORSE_A.id,
    });
    expect(url).toBe(`/session/new?activity=stall&horse_id=${HORSE_A.id}`);
    expect(url).not.toContain("subtype");
    expect(url).not.toContain("note");
  });
});

describe("autoRouteUrl (single-horse skip on /start/horse)", () => {
  it("returns the start URL when the rider has exactly one horse (riding+subtype)", () => {
    const url = autoRouteUrl([HORSE_A], { activity: "riding", subtype: "flat_work" });
    expect(url).toBe(
      `/session/new?activity=riding&horse_id=${HORSE_A.id}&subtype=flat_work`,
    );
  });

  it("returns the start URL when the rider has exactly one horse ('other'+note)", () => {
    const url = autoRouteUrl([HORSE_A], { activity: "other", note: "Polo match" });
    expect(url).toBe(
      `/session/new?activity=other&horse_id=${HORSE_A.id}&note=Polo+match`,
    );
  });

  it("returns null with 0 horses (page falls through to empty state)", () => {
    expect(autoRouteUrl([], { activity: "riding", subtype: "flat_work" })).toBeNull();
  });

  it("returns null with 2+ horses (page falls through to picker)", () => {
    expect(
      autoRouteUrl([HORSE_A, HORSE_B], { activity: "riding", subtype: "flat_work" }),
    ).toBeNull();
  });
});
