# web/07 · Admin Sessions

## Feature scope

List all sessions, drill into a specific session to see full data, traces, labels, metrics, and raw exports.

## Depends on

- `03-auth-and-permissions.md`
- `algorithms/07-session-metrics.md`

## Public interface

| Route | Component |
|---|---|
| `/admin/sessions` | `SessionsListScreen` |
| `/admin/sessions/[id]` | `SessionDetailScreen` |

## Files

```
app/admin/sessions/page.tsx                  ← ≤ 100 lines
app/admin/sessions/[id]/page.tsx             ← ≤ 130 lines
components/admin/SessionsTable.tsx            ← ≤ 120 lines
components/admin/SessionFilters.tsx           ← ≤ 100 lines
components/charts/HRTraceFull.tsx             ← ≤ 100 lines
components/charts/AccMagnitudeTrace.tsx       ← ≤ 100 lines
components/charts/HRZonesBar.tsx              ← ≤ 80 lines
components/admin/SessionMetricsPanel.tsx      ← ≤ 100 lines
components/admin/SessionExport.tsx            ← ≤ 80 lines
lib/admin/session-data.ts                     ← ≤ 100 lines
tests/e2e/admin-sessions.spec.ts
```

## Sessions list

Filters at top:
- Horse (multi-select)
- Activity type (multi-select)
- Date range
- Rider
- Status (pending/approved)

Table columns:
| Date | Horse | Rider | Activity | Duration | Avg HR | Peak HR | RMSSD | τ | Status |

Click row → session detail.

## Session detail

```
SESSION · Hippo · Riding · Today 09:00–09:50      [Export] [Edit]
─────────────────────────────────────────────────────────────────

[ Heart rate trace, 50 min, full resolution ]
[ Acc magnitude trace ]
[ Gait labels strip ]

Section A — Metrics
  Duration:        50:00
  HR avg/peak:    87 / 156 bpm
  RMSSD:           38 ms
  TRIMP:           42.1
  Recovery τ:      84 s
  Time in walk:    12 min
  Time in trot:    28 min
  Time in canter:   8 min
  Jumps:           14

Section B — HR Zones (per HRmax 225 bpm)
  Z1 50-60%   8 min
  Z2 60-70%   14 min
  Z3 70-80%   18 min
  Z4 80-90%    9 min
  Z5 90-100%   3 min

Section C — Labels
  ▓ Walk      0:00 – 12:00   auto · conf 0.92
  ▓ Trot     12:00 – 40:00   corrected by Anna
  ▓ Canter   40:00 – 48:00   auto · conf 0.81
  ▓ Jumps    48:00 – 50:00   manual · count 14

Section D — Notes
  "Felt forward today." — Anna

Section E — Raw data
  HR samples:   6,012
  ACC samples:  74,820
  ECG samples:  390,154

  [ Download CSV ]   [ Download JSON ]   [ Re-run algorithms ]
```

## Re-run algorithms

Admin button "Re-run algorithms" → POST to `/api/sessions/[id]/recompute` (web route) → enqueues a `compute_jobs` row with `job_type='recompute'` → cron picks it up, algo deletes existing auto-labels and metrics, recomputes. Useful after algorithm updates.

## Integration test

```typescript
test('admin views session detail', async ({ page }) => {
  await loginAsAdmin(page);
  await seedSession({ horse: 'Hippo', duration_s: 3000 });
  
  await page.goto('/admin/sessions');
  await page.getByText('Hippo').first().click();
  
  await expect(page.getByText('Riding · Hippo')).toBeVisible();
  await expect(page.getByText('TRIMP')).toBeVisible();
  await expect(page.locator('canvas, svg').first()).toBeVisible(); // a trace renders
});
```
