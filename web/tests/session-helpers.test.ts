import { describe, expect, it } from "vitest";

import { createSessionBody } from "@/lib/api/session-helpers";

const HORSE_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_SESSION_ID = "33333333-3333-4333-8333-333333333333";

const base = {
  horse_id: HORSE_ID,
  client_session_id: CLIENT_SESSION_ID,
};

describe("createSessionBody cross-field refinement", () => {
  it("accepts riding + heavy_jumping subtype", () => {
    const result = createSessionBody.safeParse({
      ...base,
      activity_type: "riding",
      riding_subtype: "heavy_jumping",
    });
    expect(result.success).toBe(true);
  });

  it("accepts lunging + flat_work subtype", () => {
    const result = createSessionBody.safeParse({
      ...base,
      activity_type: "lunging",
      riding_subtype: "flat_work",
    });
    expect(result.success).toBe(true);
  });

  it("rejects stall + hack subtype (subtype only allowed for riding/lunging)", () => {
    const result = createSessionBody.safeParse({
      ...base,
      activity_type: "stall",
      riding_subtype: "hack",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "riding_subtype")).toBe(true);
    }
  });

  it("rejects riding + invalid subtype value", () => {
    const result = createSessionBody.safeParse({
      ...base,
      activity_type: "riding",
      riding_subtype: "frob",
    });
    expect(result.success).toBe(false);
  });

  it("rejects activity_type 'other' with no activity_note", () => {
    const result = createSessionBody.safeParse({
      ...base,
      activity_type: "other",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "activity_note")).toBe(true);
    }
  });

  it("rejects activity_type 'other' with empty/whitespace activity_note", () => {
    const result = createSessionBody.safeParse({
      ...base,
      activity_type: "other",
      activity_note: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("accepts activity_type 'other' with 'Polo match' note", () => {
    const result = createSessionBody.safeParse({
      ...base,
      activity_type: "other",
      activity_note: "Polo match",
    });
    expect(result.success).toBe(true);
  });

  it("rejects activity_note longer than 200 chars", () => {
    const result = createSessionBody.safeParse({
      ...base,
      activity_type: "other",
      activity_note: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects activity_note set on non-'other' activity_type", () => {
    const result = createSessionBody.safeParse({
      ...base,
      activity_type: "riding",
      activity_note: "should not be here",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "activity_note")).toBe(true);
    }
  });

  it("accepts riding with no subtype (subtype is optional)", () => {
    const result = createSessionBody.safeParse({
      ...base,
      activity_type: "riding",
    });
    expect(result.success).toBe(true);
  });
});
