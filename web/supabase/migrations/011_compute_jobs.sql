-- 011_compute_jobs.sql — cron-driven retry queue for algo /compute calls.
-- Spec source: docs/shared/09-v0-1-hardening.md Fix 2.
-- Slice 10 wires enqueue (PATCH session end) + the cron runner; this slice only
-- creates the table so Phase 3 can proceed without schema work.

create table compute_jobs (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  job_type        text not null check (job_type in ('compute','recompute')),
  status          text not null default 'queued'
                    check (status in ('queued','running','succeeded','failed')),
  attempts        int not null default 0,
  next_run_at     timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index compute_jobs_pending_idx on compute_jobs(next_run_at)
  where status in ('queued','running');

comment on table compute_jobs is
  'Cron-driven retry queue for algo /compute calls. Slice 10 enqueues + drains.';

-- RLS: rider-facing reads return zero rows; admins can view; service role
-- (used by cron + algo) bypasses RLS automatically.
alter table compute_jobs enable row level security;

create policy "admins read compute_jobs"
  on compute_jobs for select
  using (is_admin_check());
