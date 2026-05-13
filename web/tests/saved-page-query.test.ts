import { describe, expect, it } from "vitest";

import {
  formatDuration,
  savedView,
  type SavedSession,
} from "@/lib/sessions/saved-summary";

function makeSession(overrides: Partial<SavedSession> = {}): SavedSession {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    activity_type: "riding",
    start_time: "2026-05-03T10:00:00.000Z",
    end_time: "2026-05-03T10:05:00.000Z",
    status: "completed",
    metrics_status: "complete",
    horse: { name: "Hippo" },
    ...overrides,
  };
}

describe("savedView", () => {
  it("redirects when session is null (not found / RLS denied)", () => {
    expect(savedView(null)).toBe("redirect");
  });

  it("redirects when status is active", () => {
    expect(savedView(makeSession({ status: "active" }))).toBe("redirect");
  });

  it("redirects when status is abandoned", () => {
    expect(savedView(makeSession({ status: "abandoned" }))).toBe("redirect");
  });

  it("redirects when end_time is null even if status='completed'", () => {
    expect(savedView(makeSession({ end_time: null }))).toBe("redirect");
  });

  it("shows analyzing while metrics_status='pending'", () => {
    expect(savedView(makeSession({ metrics_status: "pending" }))).toBe("analyzing");
  });

  it("shows analyzing while metrics_status='computing'", () => {
    expect(savedView(makeSession({ metrics_status: "computing" }))).toBe("analyzing");
  });

  it("shows summary when metrics_status='complete'", () => {
    expect(savedView(makeSession())).toBe("summary");
  });

  it("shows summary when metrics_status='failed' (so rider can see what they have)", () => {
    expect(savedView(makeSession({ metrics_status: "failed" }))).toBe("summary");
  });

  it("shows summary for approved sessions regardless of metrics_status", () => {
    expect(
      savedView(makeSession({ status: "approved", metrics_status: "pending" })),
    ).toBe("summary");
    expect(
      savedView(makeSession({ status: "approved", metrics_status: "complete" })),
    ).toBe("summary");
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
