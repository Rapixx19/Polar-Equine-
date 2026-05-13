import { describe, expect, it } from "vitest";

import {
  buildGapReport,
  phraseGap,
  phraseProgress,
} from "@/lib/research/gap-analyzer";

describe("buildGapReport", () => {
  it("returns all four gait gaps when rider has labeled nothing", () => {
    const report = buildGapReport({
      sessionsApproved: 0,
      sessionsTarget: 30,
      labelSessionCounts: {},
      horsesSampled: 0,
    });
    expect(report.sessionsRemaining).toBe(30);
    expect(report.gaps.map((g) => g.label)).toEqual(
      // sorted by needed desc — trot is largest fraction at 0.34
      ["trot", "walk", "canter", "jump"],
    );
    for (const g of report.gaps) {
      expect(g.haveSessions).toBe(0);
      expect(g.needed).toBe(g.targetSessions);
    }
  });

  it("omits labels that have hit their target", () => {
    const report = buildGapReport({
      sessionsApproved: 15,
      sessionsTarget: 30,
      labelSessionCounts: { walk: 50, trot: 50 },
      horsesSampled: 2,
    });
    const labels = report.gaps.map((g) => g.label);
    expect(labels).not.toContain("walk");
    expect(labels).not.toContain("trot");
    expect(labels).toContain("canter");
    expect(labels).toContain("jump");
  });

  it("reports 0 gaps when every target is met", () => {
    const report = buildGapReport({
      sessionsApproved: 30,
      sessionsTarget: 30,
      labelSessionCounts: { walk: 99, trot: 99, canter: 99, jump: 99 },
      horsesSampled: 5,
    });
    expect(report.gaps).toHaveLength(0);
  });

  it("clamps sessionsRemaining to 0 when over-target", () => {
    const report = buildGapReport({
      sessionsApproved: 45,
      sessionsTarget: 30,
      labelSessionCounts: {},
      horsesSampled: 3,
    });
    expect(report.sessionsRemaining).toBe(0);
  });

  it("passes horsesSampled through", () => {
    const report = buildGapReport({
      sessionsApproved: 5,
      sessionsTarget: 30,
      labelSessionCounts: { walk: 5 },
      horsesSampled: 7,
    });
    expect(report.horsesSampled).toBe(7);
  });

  it("uses a sensible target for non-default quotas", () => {
    const report = buildGapReport({
      sessionsApproved: 0,
      sessionsTarget: 10,
      labelSessionCounts: {},
      horsesSampled: 0,
    });
    // canter ≈ 0.26 of 10 → 3 (rounded)
    const canter = report.gaps.find((g) => g.label === "canter");
    expect(canter?.targetSessions).toBe(3);
  });
});

describe("phraseGap", () => {
  it("uses singular for needed=1", () => {
    expect(
      phraseGap({ label: "jump", needed: 1, targetSessions: 4, haveSessions: 3 }),
    ).toBe("1 more jump session");
  });

  it("uses plural for needed>1", () => {
    expect(
      phraseGap({ label: "canter", needed: 3, targetSessions: 8, haveSessions: 5 }),
    ).toBe("3 more canter sessions");
  });
});

describe("gaitCoverage on the report", () => {
  it("is 0 when no labels have been collected", () => {
    const report = buildGapReport({
      sessionsApproved: 0,
      sessionsTarget: 30,
      labelSessionCounts: {},
      horsesSampled: 0,
    });
    expect(report.gaitCoverage).toBe(0);
  });

  it("is 1 when every target gait is fully covered", () => {
    const report = buildGapReport({
      sessionsApproved: 30,
      sessionsTarget: 30,
      // 30 sessions × 28% walk / 34% trot / 26% canter / 12% jump rounds to
      // 8 / 10 / 8 / 4. Hitting each target exactly maxes the average.
      labelSessionCounts: { walk: 8, trot: 10, canter: 8, jump: 4 },
      horsesSampled: 3,
    });
    expect(report.gaitCoverage).toBe(1);
  });

  it("partial coverage falls between 0 and 1", () => {
    const report = buildGapReport({
      sessionsApproved: 10,
      sessionsTarget: 30,
      labelSessionCounts: { walk: 8, trot: 5 },
      horsesSampled: 2,
    });
    expect(report.gaitCoverage).toBeGreaterThan(0);
    expect(report.gaitCoverage).toBeLessThan(1);
  });
});

describe("phraseProgress", () => {
  it("shows progress mid-program", () => {
    expect(
      phraseProgress({
        sessionsApproved: 12,
        sessionsTarget: 30,
        sessionsRemaining: 18,
        gaps: [],
        horsesSampled: 2,
        gaitCoverage: 0,
      }),
    ).toBe("12 of 30 sessions logged");
  });

  it("celebrates at target", () => {
    expect(
      phraseProgress({
        sessionsApproved: 30,
        sessionsTarget: 30,
        sessionsRemaining: 0,
        gaps: [],
        horsesSampled: 5,
        gaitCoverage: 1,
      }),
    ).toMatch(/hit the target/);
  });
});
