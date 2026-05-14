-- 030_prototype_comparison_insights.sql
--
-- Cache table for Claude-generated narratives that compare the prototype
-- girth-mount sessions against baseline (bare strap) sessions. Unlike
-- session_insights (one row per session, regenerable in place), this is a
-- log of generations: the dataset changes whenever a new session is
-- recorded, so we keep the history and just show the latest row on the
-- /admin/prototype page. The "Regenerate" button inserts a fresh row.
--
-- baseline_session_count / prototype_session_count snapshot the corpus size
-- the insight was generated against, so a stale insight is obvious next to
-- the live counts.

create table prototype_comparison_insights (
  id                       uuid primary key default gen_random_uuid(),
  prompt_version           text not null,
  model                    text not null,
  insight_markdown         text not null,
  input_token_count        int  not null,
  output_token_count       int  not null,
  baseline_session_count   int  not null,
  prototype_session_count  int  not null,
  generated_at             timestamptz not null default now()
);

create index prototype_comparison_insights_generated_at_idx
  on prototype_comparison_insights (generated_at desc);

alter table prototype_comparison_insights enable row level security;

-- Admin-only. Riders never see aggregate prototype-vs-baseline narrative.
create policy "admins read prototype comparison insights"
  on prototype_comparison_insights for select
  using (is_admin_check());

create policy "admins write prototype comparison insights"
  on prototype_comparison_insights for insert
  with check (is_admin_check());

comment on table prototype_comparison_insights is
  'Append-only log of Claude narratives comparing prototype-mount sessions to baseline. '
  'Latest row shown on /admin/prototype; "Regenerate" adds a new row.';
