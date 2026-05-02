# web/05 · Admin Today Screen

## Feature scope

The admin landing page at `/admin`. Snapshot of what's happening right now across the stable.

## Depends on

- `03-auth-and-permissions.md` (admin gating)
- `web/12-realtime-channels.md` (live updates for active sessions)

## Public interface

| Route | Component |
|---|---|
| `/admin` | `TodayScreen` (server component with hydrated client widgets) |

## Files

```
app/admin/page.tsx                              ← ≤ 100 lines
components/admin/ActiveSessionsLive.tsx          ← ≤ 100 lines
components/admin/TodayCompletedList.tsx          ← ≤ 80 lines
components/admin/HorseStatusCards.tsx            ← ≤ 100 lines
components/admin/SparklineSm.tsx                 ← ≤ 60 lines
lib/admin/today-data.ts                          ← server-side data fetcher (≤ 100 lines)
tests/e2e/admin-today.spec.ts
```

## Sections (top to bottom)

### 1. Active sessions (live, refreshes every 5s via Realtime)

Row per active session: horse · rider · band · activity · elapsed time · current HR.

Empty state: "No active sessions right now."

### 2. Today's completed sessions

List of every session that ended today. Mini-stats: duration, avg HR, peak HR, jump count, label-status badge.

Click row → navigate to `/admin/sessions/[id]`.

### 3. Per-horse status cards

One card per horse:
- Name + photo
- Last session: when, what, key stat
- 7-day workload sparkline
- Resting HR (last 5 measurements)
- Status badge: "Active today" / "Rested today" / "Not seen 3+ days"

Click card → `/admin/horses/[id]`.

## Data fetching

Server component fetches in parallel:

```typescript
// lib/admin/today-data.ts

export async function getTodayData() {
  const supabase = createServerSupabaseClient();
  
  const [active, completed, horses] = await Promise.all([
    getActiveSessions(supabase),
    getCompletedSessionsToday(supabase),
    getHorsesWithRecentStats(supabase, 7),
  ]);
  
  return { active, completed, horses };
}
```

The `ActiveSessionsLive` component subscribes to Supabase Realtime on the `sessions` table for client-side live updates without polling.

## Integration test

```typescript
test('admin sees today snapshot', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin');
  
  await expect(page.getByText('La Fattoria')).toBeVisible();
  await expect(page.getByText('Active sessions')).toBeVisible();
});
```
