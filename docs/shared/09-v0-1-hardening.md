# shared/09 · V.0.1 Hardening (Critical Fixes)

> Five fixes that close real failure modes in V.0 before first deployment. None add scope; all close gaps in the existing spec.

## Why this exists

A formal CEO-level spec review surfaced 43 issues. Most are over-engineering for a research thesis. **Five are real V.0 bugs.** This file specs the fixes.

## Fix 1 — Vercel route timeout

### Problem

Default Vercel route timeout is 10 seconds. The session-end route fires the algo compute call and returns; if there's any latency (cold start, queue, network), it can exceed 10s and Vercel kills it before the job is enqueued.

### Fix

In `app/api/sessions/[id]/route.ts`, add at top of file:

```typescript
export const maxDuration = 60;  // seconds, Vercel Pro+; on Hobby max is 10
```

Note: on Vercel Hobby (free) the max is 10s. The compute trigger must therefore be enqueue-only (≤200 ms) — actual algo work runs in the algo service, not in the Vercel handler. See Fix 2.

## Fix 2 — Compute job queue

### Problem

Current spec: `/api/sessions/:id` PATCH end → fire-and-forget POST to algo `/compute`. If algo is restarting, returning 5xx, or networked-out, the session is stuck at `metrics_status='pending'` forever. No retry, no alert. This is the most common silent failure mode in spec.

### Fix

Add a `compute_jobs` table + cron-driven retry.

```sql
-- migration 008_compute_jobs.sql

create table compute_jobs (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  job_type        text not null check (job_type in ('compute','recompute')),
  status          text not null default 'queued' check (status in
                    ('queued','running','succeeded','failed')),
  attempts        int not null default 0,
  next_run_at     timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index compute_jobs_pending_idx on compute_jobs(next_run_at)
  where status in ('queued','running');
```

### Flow

1. `/api/sessions/:id` PATCH end inserts into `compute_jobs` (status='queued'), returns 200 to PWA in <200 ms
2. Supabase cron (or Vercel cron) runs every 30 seconds: `SELECT * FROM compute_jobs WHERE status='queued' AND next_run_at <= now() ORDER BY next_run_at LIMIT 5`
3. For each job: mark `status='running'`, POST to algo `/compute`
4. On 200: mark `status='succeeded'`
5. On 5xx or timeout: increment `attempts`, set `next_run_at = now() + (2 ^ attempts) seconds`, mark back to `status='queued'`
6. After 5 attempts: mark `status='failed'`, send admin email

### Files

```
supabase/migrations/008_compute_jobs.sql
app/api/cron/compute-runner/route.ts        ← ≤ 130 lines, runs every 30s
lib/jobs/compute-queue.ts                   ← enqueue / dequeue helpers (≤ 100 lines)
tests/integration/test_compute_queue.py
```

### Cron config

In `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/compute-runner", "schedule": "*/1 * * * *" }
  ]
}
```

Vercel free tier supports cron at 1-minute granularity. Good enough.

## Fix 3 — RLS policies on samples_* tables

### Problem

`02-database-schema.md` has `alter table samples_hr enable row level security;` but never defines the SELECT/INSERT policies. With RLS enabled and no policies, **all queries fail.** Riders can't insert samples; admin dashboard can't read them.

### Fix

Add explicit policies in the same migration as the `enable row level security` statements.

```sql
-- migration 005_rls_policies.sql (additions)

-- Riders can INSERT samples for their own active sessions
create policy "riders insert samples for own active sessions"
  on samples_hr for insert
  with check (
    exists (
      select 1 from sessions
      where sessions.id = samples_hr.session_id
        and sessions.rider_id = auth.uid()
        and sessions.status = 'active'
    )
  );
-- Repeat for samples_acc, samples_ecg

-- Riders can SELECT samples for their own sessions (any status)
create policy "riders read samples for own sessions"
  on samples_hr for select
  using (
    exists (
      select 1 from sessions
      where sessions.id = samples_hr.session_id
        and (sessions.rider_id = auth.uid() or is_admin_check())
    )
  );
-- Repeat for samples_acc, samples_ecg

-- Service role bypasses RLS automatically (algo service)
```

### Test (regression)

```python
# tests/integration/test_rls.py

def test_rider_cannot_read_other_rider_samples():
    a = create_test_rider()
    b = create_test_rider()
    session_a = create_test_session(rider_id=a.id)
    insert_samples(session_a.id, count=10)
    
    # b tries to read a's samples
    rows = supabase_as_user(b).table('samples_hr')\
        .select('*').eq('session_id', session_a.id).execute()
    
    assert rows.data == []  # RLS blocks the read
```

## Fix 4 — Start session idempotency

### Problem

A nervous rider taps "Start" twice. Two sessions are created for the same horse + band. Sample stream gets split across them. Confusing data.

### Fix

Client generates a UUID per "Start session" intent. Server uses it as an idempotency key.

```typescript
// PWA, on tap of Start
const client_session_id = crypto.randomUUID();
await fetch('/api/sessions', {
  method: 'POST',
  body: JSON.stringify({
    horse_id, band_id, activity_type, client_session_id
  })
});
```

```sql
-- migration 009_idempotency.sql

alter table sessions
  add column client_session_id uuid;

create unique index sessions_client_id_idx
  on sessions(client_session_id, rider_id)
  where client_session_id is not null;
```

```typescript
// app/api/sessions/route.ts
export async function POST(req) {
  const body = await req.json();
  
  // If client_session_id already exists for this rider, return existing session
  const existing = await supabase
    .from('sessions')
    .select()
    .eq('client_session_id', body.client_session_id)
    .eq('rider_id', user.id)
    .maybeSingle();
  
  if (existing.data) {
    return NextResponse.json(existing.data, { status: 200 });
  }
  
  // Otherwise create new
  ...
}
```

Plus a unique partial index preventing two active sessions on the same horse:

```sql
create unique index sessions_one_active_per_horse_idx
  on sessions(horse_id)
  where status = 'active';
```

## Fix 5 — Auto-abandon stale active sessions

### Problem

Rider walks off without tapping End. Session stays `status='active'` forever, blocking future sessions for that horse.

### Fix

Cron job that auto-abandons sessions with no ingest activity for 12 hours.

```sql
-- migration 010_session_last_ingest.sql

alter table sessions
  add column last_ingest_at timestamptz;

create index sessions_active_stale_idx
  on sessions(last_ingest_at)
  where status = 'active';
```

Update `last_ingest_at` on every successful POST to `/api/ingest/samples`.

```typescript
// app/api/cron/abandon-stale/route.ts

export async function GET(req) {
  // Auth: cron secret only
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response(null, { status: 401 });
  
  const cutoff = new Date(Date.now() - 12 * 3600 * 1000);
  
  const { data } = await supabase
    .from('sessions')
    .update({ status: 'abandoned', end_time: new Date().toISOString() })
    .eq('status', 'active')
    .lt('last_ingest_at', cutoff.toISOString())
    .select();
  
  return NextResponse.json({ abandoned: data?.length ?? 0 });
}
```

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/abandon-stale", "schedule": "0 */6 * * *" }
  ]
}
```

Runs every 6 hours. Generous enough for a research project, doesn't blow free tier cron limits.

## Files added by these fixes

```
supabase/migrations/
  008_compute_jobs.sql
  009_idempotency.sql
  010_session_last_ingest.sql

app/api/cron/
  compute-runner/route.ts        ← ≤ 130 lines
  abandon-stale/route.ts          ← ≤ 60 lines

lib/jobs/
  compute-queue.ts                 ← ≤ 100 lines

tests/integration/
  test_compute_queue.py
  test_rls.py
  test_idempotency.py
```

## What this changes in existing specs

- `02-database-schema.md` — add migrations 008-010 to the chain
- `web/10-api-sessions.md` — POST /api/sessions handles client_session_id; PATCH end enqueues to compute_jobs instead of direct HTTP
- `01-architecture.md` — data flow diagram shows job queue between web and algo
- `shared/03-incident-response.md` — runbook for "compute_jobs.status='failed' is rising"

## Acceptance criteria

These fixes are done when:

- ✅ A 50-min session ends, compute_jobs row created, succeeded within 60 seconds in normal conditions
- ✅ Algo killed mid-job → next cron tick retries and succeeds
- ✅ Algo down for 30 minutes → eventual failure, admin email sent
- ✅ Double-tap Start creates one session, returns same id both times
- ✅ Two riders trying to start session for same horse: second gets 409
- ✅ Stale active session is auto-abandoned within 18 hours (worst case: just-abandoned + cron runs in 6h)
- ✅ RLS regression test passes: rider cannot read another rider's samples
- ✅ Vercel route doesn't timeout on session-end (job queue makes it <200 ms)
