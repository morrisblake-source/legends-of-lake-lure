-- Database-enforced email admin access. Owner email is seeded separately after confirmation.
create schema if not exists ll_private;
revoke all on schema ll_private from public;
grant usage on schema ll_private to anon,authenticated;
create table ll_private.admin_emails (
 email text primary key check(email=lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 role text not null check(role in ('owner','admin')),
 created_at timestamptz not null default now()
);
create unique index one_lake_lure_owner on ll_private.admin_emails(role) where role='owner';
alter table ll_private.admin_emails enable row level security;
revoke all on ll_private.admin_emails from public,anon,authenticated;
create function ll_private.admin_role() returns text language sql stable security definer set search_path='' as $$
 select a.role from ll_private.admin_emails a join auth.users u on lower(u.email)=a.email
 where u.id=(select auth.uid()) and u.email_confirmed_at is not null;
$$;
revoke all on function ll_private.admin_role() from public;
grant execute on function ll_private.admin_role() to anon,authenticated;
create function public.ll_admin_session() returns text language sql stable security invoker set search_path='' as $$ select ll_private.admin_role(); $$;
revoke all on function public.ll_admin_session() from public;
grant execute on function public.ll_admin_session() to anon,authenticated;
create function ll_private.list_admins() returns table(email text,role text) language plpgsql security definer set search_path='' as $$
begin
 if ll_private.admin_role() is distinct from 'owner' then raise exception 'Only the owner can manage admin access.' using errcode='42501'; end if;
 return query select a.email,a.role from ll_private.admin_emails a order by a.role desc,a.email;
end; $$;
create function ll_private.change_admin(p_email text,p_remove boolean) returns void language plpgsql security definer set search_path='' as $$
declare e text:=lower(btrim(p_email));
begin
 if ll_private.admin_role() is distinct from 'owner' then raise exception 'Only the owner can manage admin access.' using errcode='42501'; end if;
 if e is null or length(e)>254 or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address.'; end if;
 if exists(select 1 from ll_private.admin_emails a where a.email=e and a.role='owner') then raise exception 'The owner cannot be removed or changed here.'; end if;
 if p_remove then delete from ll_private.admin_emails where email=e;
 else insert into ll_private.admin_emails(email,role) values(e,'admin') on conflict(email) do nothing;
 end if;
end; $$;
revoke all on function ll_private.list_admins(),ll_private.change_admin(text,boolean) from public;
grant execute on function ll_private.list_admins(),ll_private.change_admin(text,boolean) to authenticated;
create function public.ll_list_admins() returns table(email text,role text) language sql security invoker set search_path='' as $$ select * from ll_private.list_admins(); $$;
create function public.ll_change_admin(p_email text,p_remove boolean default false) returns void language sql security invoker set search_path='' as $$ select ll_private.change_admin(p_email,p_remove); $$;
revoke all on function public.ll_list_admins(),public.ll_change_admin(text,boolean) from public;
grant execute on function public.ll_list_admins(),public.ll_change_admin(text,boolean) to authenticated;

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
revoke all on public.trip_configurations,public.trip_score_entries from anon,authenticated;
grant select on public.trip_configurations,public.trip_score_entries to anon,authenticated;
create policy "trip configuration read" on public.trip_configurations for select to anon,authenticated using (year>=2027);
create policy "trip score read" on public.trip_score_entries for select to anon,authenticated using(true);

create function public.ll_trip_match_signature(p_settings jsonb,p_match_id text) returns jsonb
language sql immutable security invoker set search_path=public as $$
 select jsonb_build_object('format',r->>'format','points',r->'points','course',coalesce(m->>'course',r->>'course'),'tee',coalesce(m->>'tee',r->>'tee'),'a',m->'a','b',m->'b','players',
  (select jsonb_agg(jsonb_build_object('id',p->>'id','index',p->'index','team',p->>'team','active',p->'active') order by p->>'id') from jsonb_array_elements(p_settings->'players') p where p->>'id' in (select jsonb_array_elements_text(coalesce(m->'a','[]'::jsonb)||coalesce(m->'b','[]'::jsonb)))))
 from jsonb_array_elements(p_settings->'rounds') r cross join lateral jsonb_array_elements(r->'matches') m where m->>'id'=p_match_id;
$$;

create function ll_private.save_trip_configuration(p_event_id text,p_expected_revision integer,p_settings jsonb)
returns setof public.trip_configurations language plpgsql security definer set search_path='' as $$
declare old public.trip_configurations; mid text; y integer;
begin
 if ll_private.admin_role() is null then raise exception 'Approved admin sign-in required.' using errcode='42501'; end if;
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

create function ll_private.save_trip_scores(p_event_id text,p_revision integer,p_scores jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
revoke all on function public.ll_trip_match_signature(jsonb,text) from public;
revoke all on function ll_private.save_trip_configuration(text,integer,jsonb),ll_private.save_trip_scores(text,integer,jsonb) from public;
grant execute on function ll_private.save_trip_configuration(text,integer,jsonb) to authenticated;
grant execute on function ll_private.save_trip_scores(text,integer,jsonb) to anon,authenticated;
create function public.ll_save_trip_configuration(p_event_id text,p_expected_revision integer,p_settings jsonb)
returns setof public.trip_configurations language sql security invoker set search_path='' as $$ select * from ll_private.save_trip_configuration(p_event_id,p_expected_revision,p_settings); $$;
create function public.ll_save_trip_scores(p_event_id text,p_revision integer,p_scores jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select ll_private.save_trip_scores(p_event_id,p_revision,p_scores); $$;
revoke all on function public.ll_save_trip_configuration(text,integer,jsonb),public.ll_save_trip_scores(text,integer,jsonb) from public;
grant execute on function public.ll_save_trip_configuration(text,integer,jsonb) to authenticated;
grant execute on function public.ll_save_trip_scores(text,integer,jsonb) to anon,authenticated;

-- Make the existing ledger available to saved upcoming trips as well as 2026.
-- No finance request is changed, deleted or copied.
alter table public.finance_requests drop constraint finance_requests_event_id_check;
alter table public.finance_requests add constraint finance_requests_event_id_check check(event_id='lake-lure-2026' or event_id ~ '^lake-lure-20[2-9][0-9]$');
alter policy "finance read" on public.finance_requests using(event_id='lake-lure-2026' or exists(select 1 from public.trip_configurations c where c.event_id=finance_requests.event_id));
alter policy "finance create" on public.finance_requests with check(event_id='lake-lure-2026' or exists(select 1 from public.trip_configurations c where c.event_id=finance_requests.event_id));
alter policy "finance update" on public.finance_requests using(event_id='lake-lure-2026' or exists(select 1 from public.trip_configurations c where c.event_id=finance_requests.event_id)) with check(event_id='lake-lure-2026' or exists(select 1 from public.trip_configurations c where c.event_id=finance_requests.event_id));

-- Secure existing admin operations without changing completed-trip records.
alter policy "write players" on public.players using(ll_private.admin_role() is not null) with check(ll_private.admin_role() is not null);
alter policy "write matches" on public.matches using(ll_private.admin_role() is not null) with check(ll_private.admin_role() is not null);
alter policy "public handicap write" on public.player_handicaps using(ll_private.admin_role() is not null) with check(ll_private.admin_role() is not null);
alter policy "public contest write" on public.contest_settings using(ll_private.admin_role() is not null) with check(ll_private.admin_role() is not null);
alter policy "event_players_insert" on public.event_players with check(ll_private.admin_role() is not null);
alter policy "event_players_delete" on public.event_players using(ll_private.admin_role() is not null);
alter policy "write scores" on public.hole_scores using(ll_private.admin_role() is not null) with check(ll_private.admin_role() is not null);
alter policy "write team scores" on public.team_hole_scores using(ll_private.admin_role() is not null) with check(ll_private.admin_role() is not null);
alter policy "public ctp delete" on public.ctp_entries using(ll_private.admin_role() is not null);
alter policy "public media delete" on public.media_gallery using(ll_private.admin_role() is not null);
alter policy "public trip media delete" on storage.objects using(bucket_id='trip-media' and ll_private.admin_role() is not null);

-- Public submissions are separate from admin-owned trip configuration.
create table public.trip_ctp_entries (
 id uuid primary key default gen_random_uuid(),event_id text not null references public.trip_configurations(event_id),
 round_no integer not null check(round_no between 1 and 4),player_id text not null,
 inches integer not null check(inches between 0 and 2400),created_at timestamptz not null default now()
);
create table public.trip_media_entries (
 id uuid primary key default gen_random_uuid(),event_id text not null references public.trip_configurations(event_id),
 player_id text not null,caption text not null check(length(caption)<=120),media_type text not null,
 storage_path text not null unique,public_url text not null,created_at timestamptz not null default now()
);
alter table public.trip_ctp_entries enable row level security;
alter table public.trip_media_entries enable row level security;
revoke all on public.trip_ctp_entries,public.trip_media_entries from anon,authenticated;
grant select on public.trip_ctp_entries,public.trip_media_entries to anon,authenticated;
create policy "upcoming ctp read" on public.trip_ctp_entries for select to anon,authenticated using(true);
create policy "upcoming media read" on public.trip_media_entries for select to anon,authenticated using(true);
create function ll_private.submit_trip_ctp(p_event_id text,p_round integer,p_player text,p_inches integer) returns void language plpgsql security definer set search_path='' as $$
declare cfg jsonb;
begin
 select settings into cfg from public.trip_configurations where event_id=p_event_id;
 if cfg is null or not exists(select 1 from jsonb_array_elements(cfg->'players') p where p->>'id'=p_player and (p->>'active')::boolean) or not coalesce((cfg->'ctp'->p_round::text->>'hole')::integer between 1 and 18,false) then raise exception 'Choose a scheduled contest and active player.'; end if;
 insert into public.trip_ctp_entries(event_id,round_no,player_id,inches) values(p_event_id,p_round,p_player,p_inches);
end; $$;
create function ll_private.add_trip_media(p_event_id text,p_player text,p_caption text,p_type text,p_path text) returns void language plpgsql security definer set search_path='' as $$
declare cfg jsonb;
begin
 select settings into cfg from public.trip_configurations where event_id=p_event_id;
 if cfg is null or not exists(select 1 from jsonb_array_elements(cfg->'players') p where p->>'id'=p_player and (p->>'active')::boolean) then raise exception 'Choose an active player.'; end if;
 if p_path is null or p_path not like p_event_id||'/%' or p_path ~ '[^a-zA-Z0-9/._-]' or p_path like '%..%' or p_type !~ '^(image|video)/' then raise exception 'Invalid trip upload.'; end if;
 if not exists(select 1 from storage.objects where bucket_id='trip-media' and name=p_path) then raise exception 'Upload could not be verified.'; end if;
 insert into public.trip_media_entries(event_id,player_id,caption,media_type,storage_path,public_url) values(p_event_id,p_player,p_caption,p_type,p_path,'https://pqtsnwbtvlkvumlaujlt.supabase.co/storage/v1/object/public/trip-media/'||p_path);
end; $$;
revoke all on function ll_private.submit_trip_ctp(text,integer,text,integer),ll_private.add_trip_media(text,text,text,text,text) from public;
grant execute on function ll_private.submit_trip_ctp(text,integer,text,integer),ll_private.add_trip_media(text,text,text,text,text) to anon,authenticated;
create function public.ll_submit_trip_ctp(p_event_id text,p_round integer,p_player text,p_inches integer) returns void language sql security invoker set search_path='' as $$ select ll_private.submit_trip_ctp(p_event_id,p_round,p_player,p_inches); $$;
create function public.ll_add_trip_media(p_event_id text,p_player text,p_caption text,p_type text,p_path text) returns void language sql security invoker set search_path='' as $$ select ll_private.add_trip_media(p_event_id,p_player,p_caption,p_type,p_path); $$;
revoke all on function public.ll_submit_trip_ctp(text,integer,text,integer),public.ll_add_trip_media(text,text,text,text,text) from public;
grant execute on function public.ll_submit_trip_ctp(text,integer,text,integer),public.ll_add_trip_media(text,text,text,text,text) to anon,authenticated;
