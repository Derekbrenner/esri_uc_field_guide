-- SD Field Guide — live location sharing table.
-- Run this once in your Supabase project: Dashboard → SQL Editor → paste → Run.

create table if not exists public.attendee_locations (
  id          text primary key,           -- stable per-device id (from the browser)
  name        text not null,
  lat         double precision not null,
  lng         double precision not null,
  color       text not null default '#38E1FF',
  updated_at  timestamptz not null default now()
);

-- Realtime: push row changes to subscribed clients.
alter publication supabase_realtime add table public.attendee_locations;

-- Row Level Security: this is a small, trusted group with a shared anon key.
-- Anyone with the anon key may read all dots and write their own row.
alter table public.attendee_locations enable row level security;

create policy "read all locations"
  on public.attendee_locations for select
  using (true);

create policy "anyone can insert"
  on public.attendee_locations for insert
  with check (true);

create policy "anyone can update"
  on public.attendee_locations for update
  using (true) with check (true);

create policy "anyone can delete"
  on public.attendee_locations for delete
  using (true);

-- Optional tidy-up: a helper to purge stale rows. Call it from a scheduled
-- job, or just ignore it — the app already hides anything older than 15 min.
create or replace function public.purge_stale_locations() returns void
language sql as $$
  delete from public.attendee_locations
  where updated_at < now() - interval '30 minutes';
$$;

-- ===========================================================================
-- Social layer (Phase 2: spot voting). Idempotent — safe to re-run.
-- Spots are keyed by a string `spot_key`: 'venue:<slug>' for curated venues,
-- or the DB uuid for user-added spots. One vote per (spot_key, device_id).
-- ===========================================================================

create table if not exists public.votes (
  spot_key    text not null,
  device_id   text not null,
  name        text not null,
  created_at  timestamptz not null default now(),
  primary key (spot_key, device_id)
);

-- Realtime: push vote changes to subscribed clients (guarded so re-runs don't
-- error with "table is already member of publication").
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'votes'
  ) then
    alter publication supabase_realtime add table public.votes;
  end if;
end $$;

-- Wide-open RLS, matching the attendee_locations posture (small trusted group).
alter table public.votes enable row level security;

drop policy if exists "read all votes" on public.votes;
create policy "read all votes" on public.votes for select using (true);

drop policy if exists "anyone can vote" on public.votes;
create policy "anyone can vote" on public.votes for insert with check (true);

drop policy if exists "anyone can change a vote" on public.votes;
create policy "anyone can change a vote" on public.votes for update using (true) with check (true);

drop policy if exists "anyone can unvote" on public.votes;
create policy "anyone can unvote" on public.votes for delete using (true);
