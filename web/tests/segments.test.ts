import { describe, expect, it } from "vitest";

import {
  allBlocksLabeled,
  blockCount,
  formatDuration,
  formatTimeRange,
  segments,
  totalJumps,
  type Block,
} from "@/lib/session/segments";

const ms = (min: number) => min * 60_000;

describe("blockCount", () => {
  it("clamps to MIN_BLOCKS=4 for short sessions", () => {
    expect(blockCount(ms(5))).toBe(4);
    expect(blockCount(ms(10))).toBe(4);
  });

  it("scales with duration around the 6-minute target", () => {
    expect(blockCount(ms(30))).toBe(5);
    expect(blockCount(ms(42))).toBe(7);
  });

  it("clamps to MAX_BLOCKS=8 for long sessions", () => {
    expect(blockCount(ms(60))).toBe(8);
    expect(blockCount(ms(120))).toBe(8);
  });

  it("returns MIN_BLOCKS for invalid input", () => {
    expect(blockCount(0)).toBe(4);
    expect(blockCount(-1)).toBe(4);
    expect(blockCount(NaN)).toBe(4);
  });
});

describe("segments", () => {
  it("produces N equal-length blocks covering the full duration", () => {
    const blocks = segments(ms(30));
    expect(blocks).toHaveLength(5);
    expect(blocks[0].start_ms).toBe(0);
    expect(blocks[blocks.length - 1].end_ms).toBe(ms(30));
    // Each block has an unlabeled default
    for (const b of blocks) {
      expect(b.label).toBeNull();
      expect(b.jump_count).toBe(0);
    }
  });

  it("blocks have contiguous, non-overlapping ranges", () => {
    const blocks = segments(ms(42));
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].start_ms).toBe(blocks[i - 1].end_ms);
    }
  });

  it("absorbs the rounding remainder into the last block", () => {
    // 7 minutes / 4 blocks = 105_000 ms each, remainder absorbed into last
    const blocks = segments(ms(7));
    expect(blocks).toHaveLength(4);
    expect(blocks[blocks.length - 1].end_ms).toBe(ms(7));
  });
});

describe("formatTimeRange", () => {
  it("formats mm:ss ranges using seconds precision", () => {
    expect(formatTimeRange(0, ms(6))).toBe("0:00 – 6:00");
    expect(formatTimeRange(ms(12), ms(22))).toBe("12:00 – 22:00");
  });

  it("shows partial-minute boundaries cleanly without rounding overlap", () => {
    // 5min 35s split into 4 parts (1m 23.75s each) — adjacent ranges must
    // share an exact boundary, never overlap as the old minute-rounded format did.
    expect(formatTimeRange(0, 83_750)).toBe("0:00 – 1:24");
    expect(formatTimeRange(83_750, 167_500)).toBe("1:24 – 2:48");
  });
});

describe("formatDuration", () => {
  it("formats a duration as mm:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(ms(5) + 35_000)).toBe("5:35");
  });
});

describe("allBlocksLabeled", () => {
  it("returns false for an empty list", () => {
    expect(allBlocksLabeled([])).toBe(false);
  });

  it("returns false when any block is unlabeled", () => {
    const blocks: Block[] = [
      { index: 0, start_ms: 0, end_ms: 1000, label: "walk", jump_count: 0 },
      { index: 1, start_ms: 1000, end_ms: 2000, label: null, jump_count: 0 },
    ];
    expect(allBlocksLabeled(blocks)).toBe(false);
  });

  it("returns true when every block has a label", () => {
    const blocks: Block[] = [
      { index: 0, start_ms: 0, end_ms: 1000, label: "walk", jump_count: 0 },
      { index: 1, start_ms: 1000, end_ms: 2000, label: "trot", jump_count: 2 },
    ];
    expect(allBlocksLabeled(blocks)).toBe(true);
  });
});

describe("totalJumps", () => {
  it("sums jump_count across blocks", () => {
    const blocks: Block[] = [
      { index: 0, start_ms: 0, end_ms: 1000, label: "trot", jump_count: 2 },
      { index: 1, start_ms: 1000, end_ms: 2000, label: "canter", jump_count: 3 },
      { index: 2, start_ms: 2000, end_ms: 3000, label: "walk", jump_count: 0 },
    ];
    expect(totalJumps(blocks)).toBe(5);
  });

  it("returns 0 for an empty list", () => {
    expect(totalJumps([])).toBe(0);
  });
});
