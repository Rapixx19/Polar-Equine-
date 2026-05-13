import { describe, expect, it } from "vitest";

import {
  autoRouteUrl,
  buildSessionStartUrl,
  splitHorses,
  type HorseOption,
} from "@/lib/horses/server";

const HORSE_A: HorseOption = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Hippo",
  isGuest: false,
  lastUsedAt: null,
};
const HORSE_B: HorseOption = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Demo",
  isGuest: false,
  lastUsedAt: null,
};
const GUEST_OLD: HorseOption = {
  id: "ccccccc1-cccc-4ccc-8ccc-cccccccccccc",
  name: "Stranger",
  isGuest: true,
  lastUsedAt: "2026-05-01T10:00:00Z",
};
const GUEST_NEW: HorseOption = {
  id: "ccccccc2-cccc-4ccc-8ccc-cccccccccccc",
  name: "Visitor",
  isGuest: true,
  lastUsedAt: "2026-05-13T10:00:00Z",
};

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

describe("splitHorses", () => {
  it("partitions assigned vs guest horses", () => {
    const { assigned, recentGuests } = splitHorses([HORSE_A, GUEST_NEW, HORSE_B]);
    expect(assigned.map((h) => h.id)).toEqual([HORSE_A.id, HORSE_B.id]);
    expect(recentGuests.map((h) => h.id)).toEqual([GUEST_NEW.id]);
  });

  it("sorts guests by last_used_at desc, falling back to name", () => {
    const { recentGuests } = splitHorses([GUEST_OLD, GUEST_NEW]);
    expect(recentGuests.map((h) => h.id)).toEqual([GUEST_NEW.id, GUEST_OLD.id]);
  });

  it("caps recent guests at maxRecentGuests", () => {
    const guests: HorseOption[] = Array.from({ length: 8 }, (_, i) => ({
      id: `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, "0")}`,
      name: `G${i}`,
      isGuest: true,
      lastUsedAt: `2026-05-${String(13 - i).padStart(2, "0")}T10:00:00Z`,
    }));
    const { recentGuests } = splitHorses(guests, { maxRecentGuests: 3 });
    expect(recentGuests).toHaveLength(3);
  });
});
