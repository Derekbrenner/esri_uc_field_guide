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
