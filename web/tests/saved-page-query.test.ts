import { describe, expect, it } from "vitest";

import {
  formatDuration,
  shouldRedirectFromSaved,
  type SavedSession,
} from "@/lib/sessions/saved-summary";

function makeSession(overrides: Partial<SavedSession> = {}): SavedSession {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    activity_type: "riding",
    start_time: "2026-05-03T10:00:00.000Z",
    end_time: "2026-05-03T10:05:00.000Z",
    status: "completed",
    horse: { name: "Hippo" },
    ...overrides,
  };
}

describe("shouldRedirectFromSaved", () => {
  it("redirects when session is null (not found / RLS denied)", () => {
    expect(shouldRedirectFromSaved(null)).toBe(true);
  });

  it("redirects when status is active", () => {
    expect(shouldRedirectFromSaved(makeSession({ status: "active" }))).toBe(true);
  });

  it("redirects when status is cancelled", () => {
    expect(shouldRedirectFromSaved(makeSession({ status: "cancelled" }))).toBe(true);
  });

  it("redirects when end_time is null even if status='completed'", () => {
    expect(shouldRedirectFromSaved(makeSession({ end_time: null }))).toBe(true);
  });

  it("does NOT redirect for a completed session with end_time", () => {
    expect(shouldRedirectFromSaved(makeSession())).toBe(false);
  });
});

describe("formatDuration", () => {
  it("formats a 5-minute span as '5m 00s'", () => {
    expect(formatDuration("2026-05-03T10:00:00.000Z", "2026-05-03T10:05:00.000Z")).toBe(
      "5m 00s",
    );
  });

  it("zero-pads seconds", () => {
    expect(formatDuration("2026-05-03T10:00:00.000Z", "2026-05-03T10:05:02.000Z")).toBe(
      "5m 02s",
    );
  });

  it("returns '—' when end_time is null", () => {
    expect(formatDuration("2026-05-03T10:00:00.000Z", null)).toBe("—");
  });

  it("returns '—' when start_time is null", () => {
    expect(formatDuration(null, "2026-05-03T10:05:00.000Z")).toBe("—");
  });

  it("returns '—' when end is before start", () => {
    expect(formatDuration("2026-05-03T10:05:00.000Z", "2026-05-03T10:00:00.000Z")).toBe(
      "—",
    );
  });
});
