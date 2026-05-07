import { describe, expect, it } from "vitest";

import { classifyStartError, startErrorMessage } from "@/lib/ble/start-error";

describe("classifyStartError", () => {
  it("treats null status as network", () => {
    expect(classifyStartError(null, null)).toBe("network");
  });

  it("uses the explicit error code when present (409 horse_already_active)", () => {
    expect(classifyStartError(409, "horse_already_active")).toBe("horse_already_active");
  });

  it("falls back to status-only mapping when no error code", () => {
    expect(classifyStartError(409, null)).toBe("horse_already_active");
    expect(classifyStartError(403, null)).toBe("forbidden");
    expect(classifyStartError(401, null)).toBe("unauthorized");
    expect(classifyStartError(400, null)).toBe("invalid_request");
    expect(classifyStartError(500, null)).toBe("create_failed");
    expect(classifyStartError(503, null)).toBe("create_failed");
    expect(classifyStartError(418, null)).toBe("unknown");
  });
});

describe("startErrorMessage", () => {
  it("gives a horse-specific message for horse_already_active", () => {
    const msg = startErrorMessage("horse_already_active");
    expect(msg).toMatch(/horse/i);
    expect(msg).toMatch(/already/i);
  });

  it("gives a network-specific message for network", () => {
    expect(startErrorMessage("network")).toMatch(/network|connection/i);
  });

  it("gives an admin-specific message for forbidden", () => {
    expect(startErrorMessage("forbidden")).toMatch(/admin|assigned/i);
  });

  it("never returns an empty string", () => {
    const codes = [
      "horse_already_active",
      "forbidden",
      "unauthorized",
      "invalid_request",
      "create_failed",
      "network",
      "unknown",
    ] as const;
    for (const c of codes) {
      expect(startErrorMessage(c).length).toBeGreaterThan(0);
    }
  });
});
