-- NEW TABLE ONLY. Review and approve before running against production.
-- No existing scoring, history, player, or gallery tables are modified.
begin;
create table public.finance_requests (
  id uuid primary key,
  event_id text not null check (event_id = 'lake-lure-2026'),
  created_by text not null check (length(created_by) between 1 and 100),
  input jsonb not null check (
    jsonb_typeof(input) = 'object'
    and input ?& array['author','description','kind','amount']
    and input->>'kind' in ('split','bet')
    and length(btrim(input->>'description')) between 1 and 160
    and jsonb_typeof(input->'amount') = 'string'
    and input->>'amount' ~ '^[0-9]+([.][0-9]{1,2})?$'
  ),
  cancelled boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  history jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index finance_requests_event_date on public.finance_requests(event_id, created_at desc);
alter table public.finance_requests enable row level security;
-- The approved no-sign-in flow permits reads/creates/edits with the public anon
-- client. Selected names and creator/admin controls are UI attribution only,
-- not verified identity or financial access control. No delete policy is granted:
-- corrections are revisions or soft cancellations preserved in the ledger.
grant select, insert, update on public.finance_requests to anon, authenticated;
create policy "finance read" on public.finance_requests for select to anon, authenticated
using (event_id = 'lake-lure-2026');
create policy "finance create" on public.finance_requests for insert to anon, authenticated
with check (event_id = 'lake-lure-2026');
create policy "finance update" on public.finance_requests for update to anon, authenticated
using (event_id = 'lake-lure-2026') with check (event_id = 'lake-lure-2026');
commit;
-- Realtime is not required. Reopening Finances or using Refresh loads shared data.
