-- Optional Supabase backend for true multi-phone live scoring.
create table if not exists public.events (id text primary key, name text not null, year int not null);
create table if not exists public.players (id text primary key, name text not null, team text, handicap_index numeric, apple_ch int, bald_ch int, brights_ch int, ghin_url text);
create table if not exists public.matches (id text primary key, event_id text references public.events(id), round_no int, course text, format text, team_a text[], team_b text[], points numeric default 1);
create table if not exists public.hole_scores (match_id text references public.matches(id), hole int, player_id text references public.players(id), gross int, updated_at timestamptz default now(), primary key(match_id,hole,player_id));
alter table public.hole_scores enable row level security;
create policy "trip read" on public.hole_scores for select using (true);
create policy "trip write" on public.hole_scores for all using (true) with check (true);
-- For a private production deployment, replace the open write policy with authenticated trip-member access.
