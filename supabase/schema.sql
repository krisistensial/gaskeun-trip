-- ============================================================================
-- GASKEUN! — Supabase Free-Tier Cloud Sync Schema, PIN RPC, & `trip-assets` Bucket
-- Idempotent & safe to re-run: paste into Supabase SQL Editor and click "Run".
-- Compatible with both legacy JWT `anon` keys and new `sb_publishable_...` keys.
-- ============================================================================

create table if not exists public.shared_trips (
  trip_code text primary key,
  edit_pin_hash text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- Explicit schema & table grants for public clients (`anon` / `authenticated` / `sb_publishable_...`)
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.shared_trips to anon, authenticated;

-- Enable Row Level Security (RLS)
alter table public.shared_trips enable row level security;

-- Complete idempotent RLS policies for `shared_trips`
drop policy if exists "Allow public read by trip_code" on public.shared_trips;
create policy "Allow public read by trip_code"
  on public.shared_trips
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Allow public insert shared_trips" on public.shared_trips;
create policy "Allow public insert shared_trips"
  on public.shared_trips
  for insert
  to anon, authenticated
  with check (length(trim(trip_code)) >= 3);

drop policy if exists "Allow public update shared_trips" on public.shared_trips;
create policy "Allow public update shared_trips"
  on public.shared_trips
  for update
  to anon, authenticated
  using (true)
  with check (length(trim(trip_code)) >= 3);

-- Server-side PIN-verified upsert RPC (primary write path)
create or replace function public.create_or_mutate_trip(
  p_code text,
  p_pin_hash text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(p_code));
  v_existing_hash text;
begin
  if length(v_code) < 3 then
    raise exception 'Invalid trip_code';
  end if;

  select edit_pin_hash into v_existing_hash
  from public.shared_trips
  where upper(trim(trip_code)) = v_code;

  if v_existing_hash is null then
    insert into public.shared_trips (trip_code, edit_pin_hash, payload, updated_at)
    values (v_code, p_pin_hash, p_payload, now());
  else
    if v_existing_hash <> p_pin_hash then
      raise exception 'Invalid crew edit PIN';
    end if;

    update public.shared_trips
    set payload = p_payload,
        updated_at = now()
    where upper(trim(trip_code)) = v_code;
  end if;

  return jsonb_build_object('ok', true, 'trip_code', v_code, 'updated_at', now());
end;
$$;

grant execute on function public.create_or_mutate_trip(text, text, jsonb) to anon, authenticated;

-- Enable Supabase Realtime (`postgres_changes`) on `public.shared_trips` idempotently
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'shared_trips'
     ) then
    alter publication supabase_realtime add table public.shared_trips;
  end if;
end $$;

-- ============================================================================
-- Public Storage Bucket: `trip-assets`
-- Stores UI assets (hero cover, plan/stay/train photos, avatars, idea covers)
-- so Google Drive remains 100% clean for `Album → Photos`.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('trip-assets', 'trip-assets', true)
on conflict (id) do update
  set public = true;

drop policy if exists "Allow public read trip-assets" on storage.objects;
create policy "Allow public read trip-assets"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'trip-assets');

drop policy if exists "Allow public upload trip-assets" on storage.objects;
create policy "Allow public upload trip-assets"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'trip-assets');

drop policy if exists "Allow public update trip-assets" on storage.objects;
create policy "Allow public update trip-assets"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'trip-assets')
  with check (bucket_id = 'trip-assets');

drop policy if exists "Allow public delete trip-assets" on storage.objects;
create policy "Allow public delete trip-assets"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'trip-assets');

-- ============================================================================
-- Lightweight Crew Chat Table (`trip_messages`)
-- Text & Stickers + Emoji Reactions only (Zero media, zero calls/VC)
-- ============================================================================

create table if not exists public.trip_messages (
  id text primary key,
  trip_code text not null,
  sender_id text not null,
  sender_name text not null,
  kind text not null default 'text' check (kind in ('text', 'sticker')),
  text text not null default '',
  sticker_id text,
  reply_to jsonb,
  reactions jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_trip_messages_code_created
  on public.trip_messages (trip_code, created_at desc);

grant select, insert, update on public.trip_messages to anon, authenticated;

alter table public.trip_messages enable row level security;

drop policy if exists "Allow public read trip_messages" on public.trip_messages;
create policy "Allow public read trip_messages"
  on public.trip_messages
  for select
  to anon, authenticated
  using (length(trim(trip_code)) >= 3);

drop policy if exists "Allow public insert trip_messages" on public.trip_messages;
create policy "Allow public insert trip_messages"
  on public.trip_messages
  for insert
  to anon, authenticated
  with check (length(trim(trip_code)) >= 3 and kind in ('text', 'sticker'));

drop policy if exists "Allow public update trip_messages" on public.trip_messages;
create policy "Allow public update trip_messages"
  on public.trip_messages
  for update
  to anon, authenticated
  using (length(trim(trip_code)) >= 3)
  with check (length(trim(trip_code)) >= 3);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'trip_messages'
     ) then
    alter publication supabase_realtime add table public.trip_messages;
  end if;
end $$;
