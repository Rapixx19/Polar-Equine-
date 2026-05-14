-- Per-session Claude-generated narrative cache (Slice 16.A).
-- One row per session, regenerable. Stored so opening an admin/rider
-- detail page does not re-bill the Anthropic API on every load.
--
-- Writes are admin-only (the POST route does an is_admin gate too —
-- defense in depth). Reads are open to the session's rider as well as
-- admins, so a forward-compatible rider-facing insight view is possible
-- without a follow-up RLS migration.

create table session_insights (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade unique,
  model text not null,
  prompt_version text not null,
  insight_markdown text not null,
  input_token_count int not null,
  output_token_count int not null,
  generated_at timestamptz not null default now()
);

alter table session_insights enable row level security;

create policy "riders read own session insights"
  on session_insights for select
  using (
    exists (
      select 1 from sessions s
      where s.id = session_insights.session_id
        and (s.rider_id = auth.uid() or is_admin_check())
    )
  );

create policy "admins insert session insights"
  on session_insights for insert
  with check (is_admin_check());

create policy "admins update session insights"
  on session_insights for update
  using (is_admin_check())
  with check (is_admin_check());

create policy "admins delete session insights"
  on session_insights for delete
  using (is_admin_check());

comment on table session_insights is
  'Per-session Claude-generated narrative. One row per session, regenerable. '
  'Admin-write, rider-read-own + admin-read-all via RLS.';
