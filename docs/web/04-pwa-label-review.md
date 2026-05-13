# web/04 · PWA Label Review

## Feature scope

Post-session screen where the rider tags each pre-segmented time block with a gait label + per-block jump count, then hits Approve. Slice 15.A ships **manual-only** (no auto-labels) — every label captured here is rider ground truth, written to `label_corrections` with `correction_kind='manual'` and `algo_version='manual-v1'`. This data trains the Slice 13 RF gait classifier and any freelancer follow-up model.

## Status

**Slice 15.A — shipped.** Manual block labels + approve. Files, API, and migration are all live in `main`.

**Slice 15.B — deferred.** Long-press to split blocks, Bluefy touch-event polish.

**Future (V0.x / V1):** Auto-label rendering once Slice 13 lands, drag-boundary editing, HR mini-trace context, IndexedDB offline cache.

## Depends on

- `web/10-api-sessions.md` — `POST /api/sessions/[id]/labels`
- `02-database-schema.md` — `label_corrections` table (migration 013), `correction_kind` enum + `auto_jump_count` / `corrected_jump_count` columns (migration 022)
- `algorithms/06-gait-detection.md` — describes the auto-label pipeline these manual labels will eventually train

## Routes & components

| Route / file | Role |
|---|---|
| `/session/[id]/review` (page.tsx) | Server component. UUID-validates `id`, fetches session, redirects to `/saved` if status ≠ `completed` or edit window closed, otherwise renders `<ReviewClient>` |
| `ReviewClient.tsx` | `'use client'`. Top-level state machine. Holds `blocks: Block[]` computed once from `duration_ms`. POSTs to `/api/sessions/[id]/labels` on Approve, navigates to `/home` on success |
| `TimelineSegments.tsx` | Renders one pill per block. Filled blocks show the chip color + jump-count badge. Unfilled blocks show "?" + minute range. Tap → opens label sheet |
| `LabelChipSheet.tsx` | Bottom sheet (slides up). Shows block header ("Block 3 · 12–22 min"), 6 label chips (`halt / walk / trot / canter / jump / not_sure`), and a jump counter row (`[ – ] N [ + ]`) |
| `components/home/NeedsReviewBanner.tsx` | Server component on `/home`. Surfaces the most recent `status='completed'` session inside the 24-hour edit window |
| `lib/session/segments.ts` | Pure utilities: `segments(durationMs)`, `formatMinuteRange()`, `allBlocksLabeled()` |
| `app/api/sessions/[id]/labels/route.ts` | POST handler. Auth + ownership + status + edit-window checks, then bulk-inserts label rows + flips session status to `approved` in one transaction |

## Block math

`min(8, max(4, round(duration_min / 6)))` equal-width blocks of shape `{ index, start_ms, end_ms, label, jump_count }`.

- 5-min session → 4 blocks
- 30-min → 5 blocks
- 60-min → 8 blocks (cap)

HR-breakpoint segmentation is a future enhancement if riders report block boundaries straddling gait changes.

## Edit window

24 hours from `sessions.created_at` (UTC). After that the POST returns `410 Gone { error: 'edit_window_closed' }`. We use UTC + 24h instead of local-midnight because no `rider_profiles.timezone` column exists yet, and 24h is slightly more forgiving for late-evening sessions while keeping the same "memory-fresh labels" intent.

## Approve flow

1. Rider taps each unfilled block → picks label + (if applicable) jump count → "Save block" closes the sheet.
2. Once `allBlocksLabeled(blocks)` is true, the Approve button enables.
3. Tap Approve → `POST /api/sessions/[id]/labels` with `{ blocks: [{ start_ms, end_ms, label, jump_count }, ...] }`.
4. Server validates: rider owns session, `status === 'completed'`, `now() < created_at + 24h`, `blocks.length > 0`.
5. In one Supabase RPC call (atomic): bulk insert `label_corrections` rows + update `sessions.status = 'approved'`.
6. On 200, client navigates to `/home`. NeedsReviewBanner disappears because no session matches the "completed within 24h" filter anymore.

## Failure modes

| Situation | Response |
|---|---|
| Not signed in | 401, redirect to `/` |
| Session not found / not owned | 404 |
| Status already `approved` (or not yet `completed`) | 409 — second submission idempotently rejected |
| `now() > created_at + 24h` | 410 `{ error: 'edit_window_closed' }`, client shows "Edit window expired" |
| Empty blocks array | 400 `{ error: 'no_labels' }` |
| RLS denial during insert | 500, logged with structured `code` / `message` / `details` / `hint` for debugging |
| Rider abandons review | Session stays `completed`; banner persists for the 24h window |

## Tests

- `tests/segments.test.ts` — pure unit tests for block math: 5-min → 4 blocks, 30-min → 5, 60-min → 8 (cap), `formatMinuteRange` formatting, `allBlocksLabeled` true/false.
- `tests/api-session-labels.test.ts` — Vitest with mocked Supabase client. Cases: 401 unauthenticated, 404 not-owned, 409 wrong status, 410 window closed, 400 empty blocks, 200 valid input, idempotency (second valid POST → 409 because status flipped to `approved`).

## Verification (manual, before merging the slice)

1. Record a fresh ~3-min H10 session on Ferdinand's iPhone via Bluefy.
2. Wait for compute to land (`status='completed'`).
3. Open `/home` → expect the NeedsReviewBanner.
4. Tap → land on review screen, 4 blocks visible.
5. Tap each block, pick label, set jump count if applicable, save.
6. Approve → land back on `/home`, banner gone.
7. Verify in Supabase Studio: 4 `label_corrections` rows with `correction_kind='manual'` and `algo_version='manual-v1'`, session `status='approved'`.
8. Revisit `/session/[id]/review` → should redirect (status no longer `completed`).

## Kill switch (used during 15.A build)

If gesture handling on Bluefy fights the build for >2 hrs, ship aggregate-only mode (one chip: "this session was mostly walk/trot/canter") — coarser ground truth, restored to block grid in 15.B. Not invoked — block grid worked first try on Bluefy.

## 15.B roadmap (not shipped)

- Long-press (500ms) on a block → `<SplitBlockSheet>` → split in half / thirds. Replaces the block with 2 or 3 unlabeled children.
- Bluefy text-selection magnifier suppression around blocks.
- Touch-event quirks on iOS Safari WebKit smoothed.

## V0.x / V1 roadmap (deferred until after Slice 13)

- **Auto-label rendering.** Once `algorithms/06-gait-detection.md` produces RF auto-labels, the review screen pre-fills blocks. Rider corrections write `correction_kind='correction'` rows alongside the `auto_*` originals so we capture the diff.
- **HR mini-trace** above the block grid for context (deferred from 15.A because no API or chart component existed; will land naturally in Slice 16 admin dashboard alongside Recharts).
- **Drag-boundary resizing** for block timing (currently fixed equal-width).
- **Add / delete blocks** beyond the auto-computed count.
- **Notes textarea** at the bottom of the review screen — already shipped in 15.A.
- **IndexedDB cache** for in-progress edits across network drops.
