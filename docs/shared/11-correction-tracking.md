# shared/11 · Correction Tracking & Classifier Improvement

## Why this exists

When a rider corrects a label in the review screen, that correction is gold — it's ground truth from a domain expert. But unless we track corrections systematically, we can't:

- Measure if the auto-classifier is getting better or worse over time
- Identify systematic errors (e.g., "trot is consistently misclassified as canter on this horse")
- Justify swapping in V.1's ML classifier ("here's the V.0 baseline accuracy, here's V.1's")
- Distinguish "rider was lazy and approved auto-labels blindly" from "auto-labels were correct and accepted"

This spec defines what gets logged, what metrics surface, and how we use them.

## What gets logged

When a rider hits "Save" in the review screen (`web/04-pwa-label-review.md`), each label in the final saved set falls into one of three buckets:

| Source | What happened |
|---|---|
| `auto` | Algo produced the label, rider approved it without changing it |
| `corrected` | Algo produced a label, rider changed it to a different one |
| `manual` | Rider added a label that algo didn't produce (or filled a gap) |

The current spec already stores `source` on every label. **We need to also store the original auto-label when it was corrected.** This is the "ground truth pair" data.

### Schema addition (migration 011)

```sql
-- migration 011_label_corrections.sql

create table label_corrections (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  
  -- What the algo produced
  auto_start_ms   bigint not null,
  auto_end_ms     bigint not null,
  auto_label_type text not null,
  auto_confidence real,
  
  -- What the rider corrected it to (null if they approved auto)
  corrected_start_ms   bigint,
  corrected_end_ms     bigint,
  corrected_label_type text,
  
  -- Metadata
  correction_kind text not null check (correction_kind in
                    ('approved','relabelled','retimed','deleted','split','merged')),
  rider_id        uuid references rider_profiles(id),
  algo_version    text not null,
  created_at      timestamptz default now()
);

create index label_corrections_session_idx on label_corrections(session_id);
create index label_corrections_kind_idx on label_corrections(correction_kind);
```

### How corrections are detected

When the rider's saved labels are POSTed to `/api/sessions/[id]/labels`:

1. Server fetches the existing auto-labels for the session
2. For each auto-label, find its closest match in the rider's saved set:
   - **Approved** — same start/end ±200ms, same label_type → `correction_kind='approved'`
   - **Relabelled** — same start/end ±500ms, different label_type → `correction_kind='relabelled'`
   - **Retimed** — same label_type, boundaries shifted >500ms → `correction_kind='retimed'`
   - **Deleted** — auto-label has no matching rider label → `correction_kind='deleted'`
3. For each rider-only label not matching any auto-label → insert with `correction_kind='manual'` and auto fields null
4. Detect splits/merges by counting auto labels per rider label and vice versa

This logic lives in `lib/labels/correction-tracker.ts` (≤ 100 lines).

## Metrics surfaced to admin

In `/admin/today` and `/admin/horses/[id]`, two new panels:

### Panel 1 — Classifier accuracy this week

```
Auto-label approval rate (last 7 days)
─────────────────────────────────────────
Walk           87% approved (623/716)
Trot           74% approved (892/1205)
Canter/gallop  68% approved (412/606)
Jump          81% approved (134/165)

Corrections by type
─────────────────────────────────────────
Relabelled    283 (most common: trot → canter)
Retimed       147
Deleted        62
Manual added   38
```

If approval rate drops below 60% for any gait, banner: "Classifier accuracy declining — review with admin."

### Panel 2 — Per-horse correction patterns

```
Hippo · 18 sessions in last 30 days
─────────────────────────────────────────
Auto-label approval rate: 79%
Common corrections:
  - 12× trot relabelled to canter (likely fast trot)
  - 8× canter retimed (typically extending start by ~3s)
  - 3× missed jumps (rider added manually)
```

This is *operationally useful right now* (you spot which horses' data needs more careful handling) and *V.1 useful* (you know exactly where the classifier needs to improve).

## Files

```
supabase/migrations/011_label_corrections.sql

lib/labels/correction-tracker.ts                ← ≤ 100 lines, detects corrections
lib/labels/correction-stats.ts                  ← ≤ 80 lines, aggregations

components/admin/ClassifierAccuracyPanel.tsx    ← ≤ 100 lines
components/admin/PerHorseCorrectionPatterns.tsx ← ≤ 100 lines

tests/integration/test_correction_tracking.py
```

## Computation flow

When `/api/sessions/[id]/labels` POST arrives:

```typescript
// app/api/sessions/[id]/labels/route.ts (updated)

export async function POST(req, { params }) {
  const { labels: riderLabels } = await req.json();
  
  // 1. Fetch existing auto-labels
  const autoLabels = await fetchLabels(params.id, source='auto');
  
  // 2. Detect corrections
  const corrections = detectCorrections(autoLabels, riderLabels);
  
  // 3. Insert correction records
  await supabase.from('label_corrections').insert(corrections);
  
  // 4. Replace labels (existing logic)
  await supabase.from('labels').delete().eq('session_id', params.id);
  await supabase.from('labels').insert(riderLabels.map(l => ({
    ...l,
    source: detectSource(l, autoLabels),  // auto/corrected/manual
  })));
  
  // 5. Mark session approved
  await supabase.from('sessions').update({ status: 'approved' }).eq('id', params.id);
  
  return NextResponse.json({ ok: true });
}
```

## What this enables for V.1

Six months from now when V.1 ML training begins:

```python
# Get ground truth data
corrections = pd.read_sql("""
  SELECT auto_label_type, corrected_label_type, correction_kind
  FROM label_corrections
  WHERE corrected_label_type IS NOT NULL
""", conn)

# Confusion matrix of where the V.0 classifier was wrong
confusion = pd.crosstab(corrections.auto_label_type, corrections.corrected_label_type)
```

That confusion matrix tells you exactly where to focus V.1's training. The training dataset (per `shared/10-training-dataset.md`) has the underlying signals; the corrections data tells you which signals were ambiguous to the V.0 algo.

## What we're NOT doing in V.0

- ❌ Real-time online learning from corrections (V.1 territory)
- ❌ Retraining the rule-based classifier mid-study (don't change the experiment mid-experiment)
- ❌ Showing accuracy metrics to riders (avoid gaming behavior)
- ❌ Penalizing riders for high correction rates (corrections are the *goal*, not failures)

## A note on rider behavior

A real risk: riders click "approve" without actually reviewing because it's faster. To detect this:

- Track time spent on review screen (median for a 50-min session should be 30-90 seconds)
- Sessions with <10 seconds review time and 100% auto-approval get flagged in the data quality breakdown
- This DOESN'T affect the rider's UX — it's an admin-only quality signal

For V.0, we only flag this; we don't act on it. For V.1 / commercial, we might re-prompt the rider.

## Tests

```python
def test_relabel_creates_correction_record():
    """When rider changes auto trot → canter, a correction is logged."""
    auto = [{'start_ms': 0, 'end_ms': 60_000, 'label_type': 'trot'}]
    rider = [{'start_ms': 0, 'end_ms': 60_000, 'label_type': 'canter_gallop'}]
    
    corrections = detect_corrections(auto, rider)
    
    assert len(corrections) == 1
    assert corrections[0]['correction_kind'] == 'relabelled'
    assert corrections[0]['auto_label_type'] == 'trot'
    assert corrections[0]['corrected_label_type'] == 'canter_gallop'

def test_approval_creates_approval_record():
    """When rider approves auto label unchanged, a record is still logged."""
    auto = [{'start_ms': 0, 'end_ms': 60_000, 'label_type': 'walk'}]
    rider = [{'start_ms': 0, 'end_ms': 60_000, 'label_type': 'walk'}]
    
    corrections = detect_corrections(auto, rider)
    
    assert len(corrections) == 1
    assert corrections[0]['correction_kind'] == 'approved'
    # corrected_label_type stays null when nothing was changed
```
