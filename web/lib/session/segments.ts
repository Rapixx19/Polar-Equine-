// Pure block-math helpers for the manual label review UI (Slice 15.A).
// Kept dependency-free so it can be tested in isolation.

export const GAIT_LABELS = [
  "halt",
  "walk",
  "trot",
  "canter",
  "jump",
  "not_sure",
] as const;
export type GaitLabel = (typeof GAIT_LABELS)[number];

export type Block = {
  index: number;
  start_ms: number;
  end_ms: number;
  label: GaitLabel | null;
  jump_count: number;
};

const MIN_BLOCKS = 4;
const MAX_BLOCKS = 8;
const TARGET_BLOCK_MIN = 6;

export function blockCount(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return MIN_BLOCKS;
  const minutes = durationMs / 60_000;
  const target = Math.round(minutes / TARGET_BLOCK_MIN);
  return Math.min(MAX_BLOCKS, Math.max(MIN_BLOCKS, target));
}

export function segments(durationMs: number): Block[] {
  const n = blockCount(durationMs);
  const total = Math.max(0, Math.floor(durationMs));
  const step = Math.floor(total / n);
  const out: Block[] = [];
  for (let i = 0; i < n; i++) {
    const start_ms = i * step;
    const end_ms = i === n - 1 ? total : (i + 1) * step;
    out.push({ index: i, start_ms, end_ms, label: null, jump_count: 0 });
  }
  return out;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function clockFromMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${pad2(s)}`;
}

export function formatTimeRange(start_ms: number, end_ms: number): string {
  return `${clockFromMs(start_ms)} – ${clockFromMs(end_ms)}`;
}

export function formatDuration(durationMs: number): string {
  return clockFromMs(durationMs);
}

export function allBlocksLabeled(blocks: Block[]): boolean {
  if (blocks.length === 0) return false;
  return blocks.every((b) => b.label !== null);
}

export function totalJumps(blocks: Block[]): number {
  return blocks.reduce((sum, b) => sum + (b.jump_count || 0), 0);
}
