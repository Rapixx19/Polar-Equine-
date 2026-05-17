import { describe, expect, it } from "vitest";

import {
  isAndroidUserAgent,
  isIosUserAgent,
  shouldShowGuard,
} from "@/lib/ui/pre-session-guard";

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

describe("isAndroidUserAgent", () => {
  it("returns true for Android Chrome", () => {
    expect(
      isAndroidUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0.0.0"),
    ).toBe(true);
  });

  it("returns false for iPhone", () => {
    expect(isAndroidUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)")).toBe(false);
  });

  it("returns false for desktop Chrome", () => {
    expect(isAndroidUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120.0.0.0")).toBe(
      false,
    );
  });
});

describe("shouldShowGuard", () => {
  it("returns 'ios' on iOS when not yet dismissed", () => {
    expect(shouldShowGuard({ userAgent: "iPhone", dismissed: false })).toBe("ios");
  });
  it("returns null on iOS when already dismissed this session", () => {
    expect(shouldShowGuard({ userAgent: "iPhone", dismissed: true })).toBeNull();
  });
  it("returns 'android' on Android when not yet dismissed", () => {
    expect(
      shouldShowGuard({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0.0.0",
        dismissed: false,
      }),
    ).toBe("android");
  });
  it("returns null on Android when already dismissed", () => {
    expect(
      shouldShowGuard({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0.0.0",
        dismissed: true,
      }),
    ).toBeNull();
  });
  it("returns null on desktop regardless of dismissal", () => {
    expect(
      shouldShowGuard({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120.0.0.0",
        dismissed: false,
      }),
    ).toBeNull();
  });
});
