import { describe, expect, it } from "vitest";

import { sortHorsesWithPreferred, type HorseOption } from "@/lib/horses/server";

const A: HorseOption = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Andorra",
  isGuest: false,
  lastUsedAt: null,
};
const B: HorseOption = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Bertha",
  isGuest: false,
  lastUsedAt: null,
};
const C: HorseOption = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  name: "Caliban",
  isGuest: false,
  lastUsedAt: null,
};

describe("sortHorsesWithPreferred", () => {
  it("hoists the preferred horse to position 0 with isPreferred=true", () => {
    const out = sortHorsesWithPreferred([A, B, C], B.id);
    expect(out.map((h) => h.id)).toEqual([B.id, A.id, C.id]);
    expect(out[0]).toMatchObject({ id: B.id, name: "Bertha", isPreferred: true });
    // The non-preferred horses preserve their input relative order.
    expect(out[1]).toMatchObject({ id: A.id, isPreferred: false });
    expect(out[2]).toMatchObject({ id: C.id, isPreferred: false });
  });

  it("returns unchanged order when preferred id is null (rider has never recorded)", () => {
    const out = sortHorsesWithPreferred([A, B, C], null);
    expect(out.map((h) => h.id)).toEqual([A.id, B.id, C.id]);
    expect(out.every((h) => h.isPreferred === false)).toBe(true);
  });

  it("returns unchanged order when preferred id is not in the list (orphan-safe)", () => {
    const ORPHAN_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const out = sortHorsesWithPreferred([A, B, C], ORPHAN_ID);
    expect(out.map((h) => h.id)).toEqual([A.id, B.id, C.id]);
    expect(out.every((h) => h.isPreferred === false)).toBe(true);
  });

  it("handles empty list gracefully", () => {
    expect(sortHorsesWithPreferred([], B.id)).toEqual([]);
    expect(sortHorsesWithPreferred([], null)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [A, B, C];
    const snapshot = [...input];
    sortHorsesWithPreferred(input, B.id);
    expect(input).toEqual(snapshot);
  });
});
