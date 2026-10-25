-- Additive upcoming-trip storage. Existing 2026 rows are not rewritten.
create table public.trip_configurations (
 event_id text primary key,
 year integer not null check (year between 2027 and 2099),
 settings jsonb not null,
 revision integer not null default 1 check (revision>0),
 updated_at timestamptz not null default now(),
 check(event_id='lake-lure-'||year::text),
 check(jsonb_typeof(settings)='object' and (settings->>'year')::integer=year and jsonb_typeof(settings->'players')='array' and jsonb_array_length(settings->'rounds')=4)
);
create table public.trip_score_entries (
 event_id text not null references public.trip_configurations(event_id),
 match_id text not null,
 hole integer not null check(hole between 1 and 18),
 scorer_id text not null,
 gross integer not null check(gross between 1 and 30),
 updated_at timestamptz not null default now(),
 primary key(event_id,match_id,hole,scorer_id)
);
alter table public.trip_configurations enable row level security;
alter table public.trip_score_entries enable row level security;
grant select,insert,update on public.trip_configurations to anon,authenticated;
grant select,insert,update,delete on public.trip_score_entries to anon,authenticated;
create policy "trip configuration read" on public.trip_configurations for select to anon,authenticated using (year>=2027);
create policy "trip configuration create" on public.trip_configurations for insert to anon,authenticated with check(year>=2027);
create policy "trip configuration edit" on public.trip_configurations for update to anon,authenticated using(year>=2027) with check(year>=2027);
create policy "trip score access" on public.trip_score_entries for all to anon,authenticated using(exists(select 1 from public.trip_configurations c where c.event_id=trip_score_entries.event_id)) with check(exists(select 1 from public.trip_configurations c where c.event_id=trip_score_entries.event_id));

create function public.ll_trip_match_signature(p_settings jsonb,p_match_id text) returns jsonb
language sql immutable security invoker set search_path=public as $$
 select jsonb_build_object('format',r->>'format','points',r->'points','course',coalesce(m->>'course',r->>'course'),'tee',coalesce(m->>'tee',r->>'tee'),'a',m->'a','b',m->'b','players',
  (select jsonb_agg(jsonb_build_object('id',p->>'id','index',p->'index','team',p->>'team','active',p->'active') order by p->>'id') from jsonb_array_elements(p_settings->'players') p where p->>'id' in (select jsonb_array_elements_text(coalesce(m->'a','[]'::jsonb)||coalesce(m->'b','[]'::jsonb)))))
 from jsonb_array_elements(p_settings->'rounds') r cross join lateral jsonb_array_elements(r->'matches') m where m->>'id'=p_match_id;
$$;

create function public.ll_save_trip_configuration(p_event_id text,p_expected_revision integer,p_settings jsonb)
returns setof public.trip_configurations language plpgsql security invoker set search_path=public as $$
declare old public.trip_configurations; mid text; y integer;
begin
 y:=(p_settings->>'year')::integer;
 if y<2027 or y>2099 or p_event_id<>'lake-lure-'||y::text then raise exception 'Only upcoming trips can be configured.'; end if;
 select * into old from public.trip_configurations where event_id=p_event_id for update;
 if not found then
  if p_expected_revision<>0 then raise exception 'Trip setup changed. Refresh and try again.'; end if;
  return query insert into public.trip_configurations(event_id,year,settings) values(p_event_id,y,p_settings) returning *;
  return;
 end if;
 if old.revision<>p_expected_revision then raise exception 'Another admin changed this setup. Refresh before saving.'; end if;
 for mid in select distinct match_id from public.trip_score_entries where event_id=p_event_id loop
  if public.ll_trip_match_signature(old.settings,mid) is distinct from public.ll_trip_match_signature(p_settings,mid) then
   raise exception 'Saved scores lock the players, handicaps, format, points, course and tees for that match.';
  end if;
 end loop;
 return query update public.trip_configurations set settings=p_settings,revision=old.revision+1,updated_at=now() where event_id=p_event_id returning *;
end; $$;

create function public.ll_save_trip_scores(p_event_id text,p_revision integer,p_scores jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare cfg public.trip_configurations; row jsonb; m jsonb; r jsonb; format text; n integer; who text; h integer; g integer;
begin
 select * into cfg from public.trip_configurations where event_id=p_event_id for update;
 if not found or cfg.revision<>p_revision then raise exception 'Trip setup changed. Refresh the match before saving scores.'; end if;
 if jsonb_typeof(p_scores)<>'array' or jsonb_array_length(p_scores)>100 then raise exception 'Invalid score batch.'; end if;
 for row in select * from jsonb_array_elements(p_scores) loop
  select rd,mt into r,m from jsonb_array_elements(cfg.settings->'rounds') rd cross join lateral jsonb_array_elements(rd->'matches') mt where mt->>'id'=row->>'match_id';
  if m is null then raise exception 'Match not found in this trip.'; end if;
  format:=r->>'format';n:=case when format='singles' then 1 else 2 end;
  if jsonb_array_length(m->'a')<>n or jsonb_array_length(m->'b')<>n or exists(select 1 from jsonb_array_elements_text((m->'a')||(m->'b')) id where id='') then raise exception 'Complete the pairings before entering scores.'; end if;
  who:=row->>'scorer_id';h:=(row->>'hole')::integer;g:=(row->>'gross')::integer;
  if h not between 1 and 18 or who is null or who='' then raise exception 'Invalid hole or player.'; end if;
  if format='modified_alt' then
   if who not in ('team_a','team_b') then raise exception 'Enter team scores for modified alternate shot.'; end if;
  elsif not exists(select 1 from jsonb_array_elements_text((m->'a')||(m->'b')) id where id=who) then raise exception 'This player is not in this match.';
  end if;
  if g is null then delete from public.trip_score_entries where event_id=p_event_id and match_id=row->>'match_id' and hole=h and scorer_id=who;
  else
   if g not between 1 and 30 then raise exception 'Scores must be from 1 to 30.'; end if;
   insert into public.trip_score_entries(event_id,match_id,hole,scorer_id,gross) values(p_event_id,row->>'match_id',h,who,g)
   on conflict(event_id,match_id,hole,scorer_id) do update set gross=excluded.gross,updated_at=now();
  end if;
 end loop;
 return jsonb_build_object('saved',jsonb_array_length(p_scores));
end; $$;
grant execute on function public.ll_trip_match_signature(jsonb,text),public.ll_save_trip_configuration(text,integer,jsonb),public.ll_save_trip_scores(text,integer,jsonb) to anon,authenticated;

-- Make the existing ledger available to saved upcoming trips as well as 2026.
-- No finance request is changed, deleted or copied.
alter table public.finance_requests drop constraint finance_requests_event_id_check;
alter table public.finance_requests add constraint finance_requests_event_id_check check(event_id='lake-lure-2026' or event_id ~ '^lake-lure-20[2-9][0-9]$');
alter policy "finance read" on public.finance_requests using(event_id='lake-lure-2026' or exists(select 1 from public.trip_configurations c where c.event_id=finance_requests.event_id));
alter policy "finance create" on public.finance_requests with check(event_id='lake-lure-2026' or exists(select 1 from public.trip_configurations c where c.event_id=finance_requests.event_id));
alter policy "finance update" on public.finance_requests using(event_id='lake-lure-2026' or exists(select 1 from public.trip_configurations c where c.event_id=finance_requests.event_id)) with check(event_id='lake-lure-2026' or exists(select 1 from public.trip_configurations c where c.event_id=finance_requests.event_id));
