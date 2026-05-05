import { describe, expect, it } from "vitest";

import { isIosUserAgent, shouldShowGuard } from "@/lib/ui/pre-session-guard";

describe("isIosUserAgent", () => {
  it("returns true for iPhone", () => {
    expect(
      isIosUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15",
      ),
    ).toBe(true);
  });

  it("returns true for iPad", () => {
    expect(isIosUserAgent("Mozilla/5.0 (iPad; CPU OS 17_4)")).toBe(true);
  });

  it("returns false for Android Chrome", () => {
    expect(
      isIosUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0.0.0"),
    ).toBe(false);
  });

  it("returns false for desktop Chrome", () => {
    expect(isIosUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120.0.0.0")).toBe(false);
  });
});

describe("shouldShowGuard", () => {
  it("shows on iOS when not yet dismissed", () => {
    expect(shouldShowGuard({ userAgent: "iPhone", dismissed: false })).toBe(true);
  });
  it("hides on iOS when already dismissed this session", () => {
    expect(shouldShowGuard({ userAgent: "iPhone", dismissed: true })).toBe(false);
  });
  it("hides on non-iOS regardless of dismissal", () => {
    expect(shouldShowGuard({ userAgent: "Android", dismissed: false })).toBe(false);
  });
});
