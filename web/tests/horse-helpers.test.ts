import { describe, expect, it } from "vitest";

import { createHorseBody } from "@/lib/api/horse-helpers";

describe("createHorseBody (POST /api/horses zod schema)", () => {
  it("accepts a typical horse name", () => {
    const r = createHorseBody.safeParse({ name: "Hippo" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("Hippo");
  });

  it("trims surrounding whitespace before length-checking", () => {
    const r = createHorseBody.safeParse({ name: "   Bertha   " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("Bertha");
  });

  it("rejects empty string", () => {
    expect(createHorseBody.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects whitespace-only name (after trim, length is 0)", () => {
    expect(createHorseBody.safeParse({ name: "     " }).success).toBe(false);
  });

  it("rejects missing name field", () => {
    expect(createHorseBody.safeParse({}).success).toBe(false);
  });

  it("accepts the 80-char boundary exactly", () => {
    const eighty = "x".repeat(80);
    const r = createHorseBody.safeParse({ name: eighty });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name.length).toBe(80);
  });

  it("rejects 81 chars", () => {
    const eightyOne = "x".repeat(81);
    expect(createHorseBody.safeParse({ name: eightyOne }).success).toBe(false);
  });

  it("rejects non-string name", () => {
    expect(createHorseBody.safeParse({ name: 42 }).success).toBe(false);
    expect(createHorseBody.safeParse({ name: null }).success).toBe(false);
  });
});
