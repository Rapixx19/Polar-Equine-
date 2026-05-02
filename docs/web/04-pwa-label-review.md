# web/04 · PWA Label Review

## Feature scope

Post-session screen where the rider sees auto-detected gait labels and approves or corrects them.

## Depends on

- `algorithms/06-gait-detection.md` (produces the auto-labels)
- `web/10-api-sessions.md` (`/sessions/[id]/review` and `/sessions/[id]/labels`)

## Public interface

| Route | Component |
|---|---|
| `/session/[id]/review` | `ReviewScreen` |

## Files

```
app/(rider)/session/[id]/review/page.tsx       ← ≤ 130 lines
components/timeline/EditableTimeline.tsx        ← ≤ 150 lines
components/timeline/TimelineSegment.tsx         ← ≤ 100 lines
components/timeline/LabelPicker.tsx             ← ≤ 80 lines
components/timeline/JumpCounter.tsx             ← ≤ 80 lines
lib/labels/timeline-ops.ts                       ← ≤ 100 lines
tests/unit/labels/timeline-ops.test.ts
tests/e2e/label-review.spec.ts
```

## Screen design

```
┌────────────────────────────────────────┐
│  ← Back                                │
├────────────────────────────────────────┤
│                                        │
│  Session done. 50 minutes.             │
│  Hippo · Anna                          │
│                                        │
│  We detected:                          │
│                                        │
│  ▓▓ Walk             12 min            │
│  ▓▓▓▓▓ Trot          28 min            │
│  ▓▓ Canter            8 min            │
│  ▓ Jumps              14               │
│                                        │
│  ───────── timeline ─────────          │
│  [Walk][Trot........][C][J][Walk]      │
│  ↑ tap a segment to change its label   │
│  ↑ drag boundaries to fix timing       │
│                                        │
│  + Add segment   + Add jump            │
│                                        │
│  ┌────────────────────────────────┐    │
│  │  Notes                          │    │
│  │  ┌──────────────────────────┐  │    │
│  │  │ Felt forward today       │  │    │
│  │  └──────────────────────────┘  │    │
│  └────────────────────────────────┘    │
│                                        │
│  ┌────────────────────────────────┐    │
│  │       Looks right · Save        │    │
│  └────────────────────────────────┘    │
│                                        │
└────────────────────────────────────────┘
```

## Editable timeline component

The single most complex UI piece. Spec:

- Horizontal strip showing segments as colored blocks
- Tap segment → bottom sheet with label dropdown
- Long-press boundary → drag mode → resize segment by dragging
- "+ Add segment" → creates a new walk-default segment at the cursor position
- "+ Add jump" → opens modal: per-jump tap counter or per-round count entry
- Color: walk = stone-300, trot = blue-400, canter_gallop = amber-500, jump = red-500, rest = stone-200

## Save flow

1. Rider taps "Looks right · Save"
2. PWA collects current label set + notes
3. POST `/api/sessions/[id]/labels` with the corrected labels
4. POST `/api/sessions/[id]` PATCH `{ notes, status: 'approved' }`
5. Toast "Saved." → navigate to home

## Operations on the timeline

```typescript
// lib/labels/timeline-ops.ts

export type Segment = {
  start_ms: number;
  end_ms: number;
  label_type: LabelType;
  jump_count?: number;
  source: 'auto' | 'corrected' | 'manual';
};

export function changeSegmentLabel(
  segments: Segment[], 
  index: number, 
  newLabel: LabelType
): Segment[] {
  // Mark as 'corrected'
}

export function resizeSegmentBoundary(
  segments: Segment[], 
  segmentIndex: number, 
  side: 'start' | 'end', 
  newMs: number
): Segment[] {
  // Adjust boundary, push neighbors
}

export function addSegment(
  segments: Segment[], 
  start_ms: number, 
  end_ms: number, 
  label: LabelType
): Segment[] {
  // Insert sorted, no overlap
}

export function deleteSegment(
  segments: Segment[], 
  index: number
): Segment[];
```

## Failure modes

| Situation | Behavior |
|---|---|
| Algo compute hasn't finished yet | Show "Processing your session… this takes 5–15 seconds" with spinner; poll `/sessions/[id]/review` every 2s until ready |
| Algo failed entirely | Show "We couldn't detect gaits this time. Please add them manually." → empty timeline with all controls active |
| Network drops mid-edit | IndexedDB caches the in-progress edit; restored on reload |
| Rider abandons the review | Session stays `completed` not `approved`; admin can review from dashboard |

## Integration test

```typescript
test('rider corrects an auto-label and saves', async ({ page, mockBLE, mockAlgo }) => {
  // Set up: session ended, algo returned auto-labels
  const sessionId = await createTestSession({
    autoLabels: [
      { start_ms: 0, end_ms: 720_000, label_type: 'walk' },
      { start_ms: 720_000, end_ms: 2_400_000, label_type: 'trot' },
    ],
  });
  
  await loginAs('test@lafattoria.dev', page);
  await page.goto(`/session/${sessionId}/review`);
  
  // Tap the first segment → change to trot
  await page.locator('.timeline-segment').first().click();
  await page.getByRole('option', { name: 'Trot' }).click();
  
  await page.getByRole('button', { name: 'Looks right · Save' }).click();
  
  // Verify backend has corrected labels
  const response = await api.get(`/api/sessions/${sessionId}/review`);
  expect(response.labels[0].label_type).toBe('trot');
  expect(response.labels[0].source).toBe('corrected');
});
```
