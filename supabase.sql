-- SD Field Guide — Supabase schema.
-- Run this once in your Supabase project: Dashboard → SQL Editor → paste → Run.
--
-- This file is IDEMPOTENT: safe to run repeatedly. Tables use `if not exists`,
-- policies are dropped-then-created, realtime membership is checked first, and
-- seed data only inserts when its table is empty.
--
-- Posture: small, trusted group sharing one anon key. Every table has wide-open
-- RLS (read/insert/update/delete for anon). The whole app also works with NO
-- Supabase configured at all — social features simply stay hidden.

-- ---------------------------------------------------------------------------
-- 1. Live location sharing (original table)
-- ---------------------------------------------------------------------------

create table if not exists public.attendee_locations (
  id          text primary key,           -- stable per-device id (from the browser)
  name        text not null,
  lat         double precision not null,
  lng         double precision not null,
  color       text not null default '#38E1FF',
  updated_at  timestamptz not null default now()
);

-- Optional tidy-up: a helper to purge stale rows. Call it from a scheduled
-- job, or just ignore it — the app hides live dots after ~2 min and drops
-- "last seen" traces after 1 day on its own. The 25-hour cutoff here stays
-- just past that window so scheduling this never erases a still-shown trace.
create or replace function public.purge_stale_locations() returns void
language sql as $$
  delete from public.attendee_locations
  where updated_at < now() - interval '25 hours';
$$;

-- ---------------------------------------------------------------------------
-- 2. Social layer tables
-- ---------------------------------------------------------------------------

-- User-added spots (curated venues live in src/data/venues.ts). Their spot_key
-- is this row's uuid; curated venues use 'venue:<slug>'.
create table if not exists public.spots (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  category         text,
  lat              double precision,
  lng              double precision,
  note             text,
  added_by_name    text,
  added_by_device  text,
  created_at       timestamptz not null default now()
);

-- One upvote per (spot_key, device).
create table if not exists public.votes (
  spot_key    text not null,
  device_id   text not null,
  name        text,
  created_at  timestamptz not null default now(),
  primary key (spot_key, device_id)
);

-- GPS check-ins. One open (ended_at is null) check-in per person at a time.
create table if not exists public.checkins (
  id          uuid primary key default gen_random_uuid(),
  spot_key    text not null,
  spot_name   text,
  device_id   text not null,
  name        text,
  squad_id    uuid,
  verified    boolean not null default false,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now(),
  ended_at    timestamptz
);

create table if not exists public.squads (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  emoji             text,
  created_by_device text,
  created_at        timestamptz not null default now()
);

create table if not exists public.squad_members (
  squad_id   uuid not null,
  device_id  text not null,
  name       text,
  joined_at  timestamptz not null default now(),
  primary key (squad_id, device_id)
);

create table if not exists public.photos (
  id            uuid primary key default gen_random_uuid(),
  spot_key      text,
  lat           double precision,
  lng           double precision,
  device_id     text not null,
  name          text,
  storage_path  text not null,
  caption       text,
  created_at    timestamptz not null default now()
);

create table if not exists public.meetups (
  id                uuid primary key default gen_random_uuid(),
  spot_key          text,
  spot_name         text,
  lat               double precision,
  lng               double precision,
  meet_at           timestamptz,
  note              text,
  squad_id          uuid,
  created_by_device text,
  created_by_name   text,
  cancelled         boolean not null default false,
  created_at        timestamptz not null default now()
);

create table if not exists public.meetup_rsvps (
  meetup_id   uuid not null,
  device_id   text not null,
  name        text,
  going       boolean not null default true,
  primary key (meetup_id, device_id)
);

-- Editable crew roster (seeded from src/data/attendees.ts below).
create table if not exists public.attendees (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  group_size   int,
  org          text,
  arrive_date  date,
  depart_date  date,
  note         text,
  sort_order   int,
  updated_by   text,
  updated_at   timestamptz default now()
);

-- Editable itinerary (seeded from src/data/schedule.ts below).
create table if not exists public.schedule_items (
  id           uuid primary key default gen_random_uuid(),
  day          date,
  time_label   text,
  title        text not null,
  note         text,
  spot_key     text,
  sort_order   int,
  updated_by   text,
  updated_at   timestamptz default now()
);

create table if not exists public.bingo_claims (
  square_id   text not null,
  device_id   text not null,
  name        text,
  created_at  timestamptz not null default now(),
  primary key (square_id, device_id)
);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security — wide-open anon policies on every table.
--    (Same "small trusted group" posture as attendee_locations.)
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'attendee_locations', 'spots', 'votes', 'checkins', 'squads', 'squad_members',
    'photos', 'meetups', 'meetup_rsvps', 'attendees', 'schedule_items', 'bingo_claims'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    -- Drop any legacy attendee_locations policy names so a re-run stays clean.
    execute format('drop policy if exists "read all locations" on public.%I', t);
    execute format('drop policy if exists "anyone can insert" on public.%I', t);
    execute format('drop policy if exists "anyone can update" on public.%I', t);
    execute format('drop policy if exists "anyone can delete" on public.%I', t);

    execute format('drop policy if exists "read all" on public.%I', t);
    execute format('create policy "read all" on public.%I for select using (true)', t);

    execute format('drop policy if exists "insert all" on public.%I', t);
    execute format('create policy "insert all" on public.%I for insert with check (true)', t);

    execute format('drop policy if exists "update all" on public.%I', t);
    execute format('create policy "update all" on public.%I for update using (true) with check (true)', t);

    execute format('drop policy if exists "delete all" on public.%I', t);
    execute format('create policy "delete all" on public.%I for delete using (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Realtime — add every table to the supabase_realtime publication.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'attendee_locations', 'spots', 'votes', 'checkins', 'squads', 'squad_members',
      'photos', 'meetups', 'meetup_rsvps', 'attendees', 'schedule_items', 'bingo_claims'
    ]
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Storage — public photo bucket for spot photos.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('spot-photos', 'spot-photos', true)
on conflict (id) do nothing;

do $$
begin
  drop policy if exists "spot-photos public read" on storage.objects;
  create policy "spot-photos public read" on storage.objects
    for select using (bucket_id = 'spot-photos');

  drop policy if exists "spot-photos anon insert" on storage.objects;
  create policy "spot-photos anon insert" on storage.objects
    for insert with check (bucket_id = 'spot-photos');

  drop policy if exists "spot-photos anon delete" on storage.objects;
  create policy "spot-photos anon delete" on storage.objects
    for delete using (bucket_id = 'spot-photos');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Seed data — generated from src/data/attendees.ts and src/data/schedule.ts.
--    Only inserts when the table is empty, so re-running never duplicates.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.attendees) then
    insert into public.attendees (name, group_size, org, arrive_date, depart_date, note, sort_order, updated_by, updated_at) values
    ('Jinna', 1, 'Enterprise GIS & ITD', '2026-07-10', '2026-07-17', null, 0, 'seed', now()),
    ('Dominic', 1, 'Enterprise GIS & ITD', '2026-07-11', '2026-07-17', null, 1, 'seed', now()),
    ('Mike', 1, 'Enterprise GIS & ITD', '2026-07-12', '2026-07-17', null, 2, 'seed', now()),
    ('Keelan', 1, 'Enterprise GIS & ITD', '2026-07-12', '2026-07-17', null, 3, 'seed', now()),
    ('Aimee', 1, 'Enterprise GIS & ITD', '2026-07-11', null, null, 4, 'seed', now()),
    ('Matt M.', 1, 'Enterprise GIS & ITD', '2026-07-11', null, null, 5, 'seed', now()),
    ('Alex', 1, 'Public Works', '2026-07-11', '2026-07-17', null, 6, 'seed', now()),
    ('Greg', 1, 'Public Works', '2026-07-11', '2026-07-17', null, 7, 'seed', now()),
    ('Jadah', 1, 'Public Works', '2026-07-12', '2026-07-17', null, 8, 'seed', now()),
    ('Mostafa', 1, 'Public Works', '2026-07-11', '2026-07-17', null, 9, 'seed', now()),
    ('Erik', 1, 'Public Works', '2026-07-11', '2026-07-17', null, 10, 'seed', now()),
    ('Udy', 1, 'Public Works', '2026-07-14', '2026-07-17', null, 11, 'seed', now()),
    ('Larry', 1, 'Public Works', '2026-07-13', '2026-07-17', null, 12, 'seed', now()),
    ('Tenell', 1, 'Public Works', '2026-07-08', '2026-07-17', null, 13, 'seed', now()),
    ('Erin', 1, 'Public Works', '2026-07-10', '2026-07-15', null, 14, 'seed', now()),
    ('Tom', 1, 'Other', '2026-07-11', '2026-07-17', 'SBCAG', 15, 'seed', now()),
    ('Harry', 1, 'Other', null, null, 'Fire', 16, 'seed', now()),
    ('Ben', 1, 'Other', null, null, 'Sheriff', 17, 'seed', now()),
    ('Susan', 1, 'Other', null, null, 'Sheriff', 18, 'seed', now()),
    ('Sam', 1, 'Other', null, null, 'Sheriff', 19, 'seed', now()),
    ('Carlos', 1, 'Other', '2026-07-12', '2026-07-17', 'Assessor', 20, 'seed', now()),
    ('Caleb', 1, 'Friends & Family', null, '2026-07-17', null, 21, 'seed', now()),
    ('Henry', 1, 'Friends & Family', null, '2026-07-17', null, 22, 'seed', now()),
    ('Kacie', 1, 'Friends & Family', null, '2026-07-17', null, 23, 'seed', now()),
    ('Tanner', 1, 'Friends & Family', null, null, 'TBC', 24, 'seed', now()),
    ('Molly', 1, 'Friends & Family', null, '2026-07-17', null, 25, 'seed', now()),
    ('Frank', 1, 'Friends & Family', null, null, null, 26, 'seed', now()),
    ('Maricopa County +2', 3, 'Friends & Family', '2026-07-11', '2026-07-17', null, 27, 'seed', now()),
    ('Maricopa County +2', 3, 'Friends & Family', '2026-07-12', '2026-07-17', null, 28, 'seed', now()),
    ('Caleb''s Team +3', 4, 'Friends & Family', '2026-07-12', '2026-07-17', null, 29, 'seed', now());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from public.schedule_items) then
    insert into public.schedule_items (day, time_label, title, note, spot_key, sort_order, updated_by, updated_at) values
    ('2026-07-10', null, 'Badge pickup (if open)', 'Settle in', null, 0, 'seed', now()),
    ('2026-07-10', null, 'Relax', 'Settle in', null, 1, 'seed', now()),
    ('2026-07-11', null, 'Hall E/D — Convention Center', 'Badge pickup', null, 2, 'seed', now()),
    ('2026-07-11', null, 'Marriott Marquis', 'Badge pickup', null, 3, 'seed', now()),
    ('2026-07-11', '6:00 PM', 'La Puerta', 'Dinner / Meetup — Tacos and drinks', null, 4, 'seed', now()),
    ('2026-07-11', null, 'Werewolf', 'Follow-up spots — Karaoke', null, 5, 'seed', now()),
    ('2026-07-11', null, 'Rustic Root', 'Follow-up spots — Cocktails + more food, semi-rooftop', null, 6, 'seed', now()),
    ('2026-07-11', null, 'Whiskey House', 'Follow-up spots — Whiskey bar', null, 7, 'seed', now()),
    ('2026-07-12', null, 'Marriott Marquis — in front of Leadership Conference (morning)', 'Badge pickup options', null, 8, 'seed', now()),
    ('2026-07-12', '2–4 PM', 'Badge Pickup Social Hour @ Hall E', 'Badge pickup options', null, 9, 'seed', now()),
    ('2026-07-12', '9:00–10:00', 'Setting a Vision for Success', 'Leadership Summit', null, 10, 'seed', now()),
    ('2026-07-12', '10:30–12:00', 'Being a Geospatial Leader', 'Leadership Summit', null, 11, 'seed', now()),
    ('2026-07-12', '12:00–1:15', 'Hosted Lunch', 'Leadership Summit', null, 12, 'seed', now()),
    ('2026-07-12', '1:15–3:00', 'Engaging and Growing', 'Leadership Summit', null, 13, 'seed', now()),
    ('2026-07-12', '3:00–3:45', 'Buy-in and Advocacy', 'Leadership Summit', null, 14, 'seed', now()),
    ('2026-07-12', '6:00 PM', 'Nason''s Beer Hall', 'Dinner / Meetup — Pizza + drinks (Pendry)', null, 15, 'seed', now()),
    ('2026-07-12', null, 'Whiskey House', 'Follow-up spots (TBD) — Whiskey bar', null, 16, 'seed', now()),
    ('2026-07-13', '8:30–10:00', 'Plenary Part 1', 'Plenary — morning', null, 17, 'seed', now()),
    ('2026-07-13', '10:30–12:15', 'Plenary Part 2', 'Plenary — morning — Leave early to beat lunch crowds', null, 18, 'seed', now()),
    ('2026-07-13', '12:00 PM', 'Puesto', 'Lunch — Nice courtyard, Mexican', null, 19, 'seed', now()),
    ('2026-07-13', '2:00–4:00', 'Plenary Conclusion', 'Plenary — afternoon — Leave early to avoid the rush', null, 20, 'seed', now()),
    ('2026-07-13', '4–6 PM', '1 free drink', 'Map Gallery Reception — Get there at 4 — it gets busy', null, 21, 'seed', now()),
    ('2026-07-13', '5:00 PM', 'Bowman / Surdex @ Bay City Brewing', 'Socials — Reserve spot', null, 22, 'seed', now()),
    ('2026-07-13', '6–9 PM', 'GUICE Social @ El Chingon', 'Socials — Reserve spot', null, 23, 'seed', now()),
    ('2026-07-14', '7:00–8:00', 'Presentation Skills Workshop', 'Morning sessions', null, 24, 'seed', now()),
    ('2026-07-14', '8:30–11:00', 'AI and ArcGIS', 'Morning sessions', null, 25, 'seed', now()),
    ('2026-07-14', '10:00–11:00', 'Reimagining Right-of-Way Management with Real-Time, Automated Workflows', 'Morning sessions', null, 26, 'seed', now()),
    ('2026-07-14', '11:30–12:30', 'Public Works SIG', 'Lunch', null, 27, 'seed', now()),
    ('2026-07-14', '11:30 AM', 'Not attending PW SIG? Meetup location TBD', 'Lunch', null, 28, 'seed', now()),
    ('2026-07-14', '1:00–2:00', 'Accessibility Essentials for GIS and Mapping', 'Afternoon sessions', null, 29, 'seed', now()),
    ('2026-07-14', '2:30–3:30', 'Automating and Enhancing Apps for Accessibility', 'Afternoon sessions', null, 30, 'seed', now()),
    ('2026-07-14', '4:00–5:00', 'Public Works as a Platform for Innovation', 'Afternoon sessions', null, 31, 'seed', now()),
    ('2026-07-14', null, 'Water Utilities & Water Resources @ Marina Terrace', 'Socials', null, 32, 'seed', now()),
    ('2026-07-14', null, 'Dell & Nvidia VIP Rooftop @ Altitude Sky Lounge (Marriott)', 'Socials — Reserve spot', null, 33, 'seed', now()),
    ('2026-07-14', null, 'Electric & Gas / Telecommunications', 'Socials', null, 34, 'seed', now()),
    ('2026-07-14', null, 'GIS for Good', 'Socials', null, 35, 'seed', now()),
    ('2026-07-14', null, 'Transportation', 'Socials', null, 36, 'seed', now()),
    ('2026-07-15', '8:30–9:30', 'Strategic Asset Management', 'Morning sessions', null, 37, 'seed', now()),
    ('2026-07-15', '10:00–10:20', 'Mobile Data Collection', 'Morning sessions', null, 38, 'seed', now()),
    ('2026-07-15', '11:30–12:15', 'Indoor GIS', 'Morning sessions', null, 39, 'seed', now()),
    ('2026-07-15', '1:00–3:00 PM', 'Marriott — Pacific Ballroom Salon 14', 'Central Coast Meetup — Lunch or artisan desserts', null, 40, 'seed', now()),
    ('2026-07-15', '4:00–5:00', 'Modernizing Facilities Management for the Future', 'Afternoon sessions', null, 41, 'seed', now()),
    ('2026-07-15', null, 'Best to grab today', 'Balboa Park Party wristband pickup — Requires wearing the wristband overnight', null, 42, 'seed', now()),
    ('2026-07-15', null, 'AEC', 'Socials', null, 43, 'seed', now()),
    ('2026-07-15', '6:00–6:30', 'Advantage Program @ Marina Terrace', 'Socials — First stop', null, 44, 'seed', now()),
    ('2026-07-15', null, 'Forestry & Ag', 'Socials', null, 45, 'seed', now()),
    ('2026-07-15', '7:00–8:00', 'State and Local Gov @ Bayfront Park', 'Socials — Second stop', null, 46, 'seed', now()),
    ('2026-07-15', null, 'YPN', 'Socials', null, 47, 'seed', now()),
    ('2026-07-16', '9:36 AM', 'Balboa Park Golf Course', 'Golf — Alex / Larry / Udy / open spot?', null, 48, 'seed', now()),
    ('2026-07-16', null, 'Balboa Park Party — do it early, the line gets long today', 'Wristband pickup', null, 49, 'seed', now()),
    ('2026-07-16', '10:00–11:00', 'Advancing Public Works Assets with Real-Time Data', 'Morning sessions', null, 50, 'seed', now()),
    ('2026-07-16', '2:30–3:30', 'Strategies for Delivering Enterprise-Wide Asset Management', 'Afternoon sessions — Jinna is speaking', null, 51, 'seed', now()),
    ('2026-07-16', '2:30–3:30', 'Revealing Access Gaps: GIS Insights for More Equitable Communities', 'Afternoon sessions — Tom Vo is speaking', null, 52, 'seed', now()),
    ('2026-07-16', '5:30–9:00', 'Balboa Park', 'Balboa Park Party', null, 53, 'seed', now()),
    ('2026-07-16', '8/9 PM?', 'Craft & Commerce', 'Little Italy evening', null, 54, 'seed', now()),
    ('2026-07-16', null, 'Trolley green line runs Little Italy ↔ Convention Center', 'Little Italy evening', null, 55, 'seed', now()),
    ('2026-07-17', '9:00–10:00', 'Aligning Geospatial and IT Strategies', 'Morning sessions', null, 56, 'seed', now()),
    ('2026-07-17', null, 'Closing session', 'Closing', null, 57, 'seed', now()),
    ('2026-07-17', null, 'Departure', 'Closing', null, 58, 'seed', now());
  end if;
end $$;
