-- ============================================================================
-- GASKEUN! — Supabase Free-Tier Cloud Sync Schema, PIN RPC, & `trip-assets` Bucket
-- Idempotent & safe to re-run: paste into Supabase SQL Editor and click "Run".
-- ============================================================================

create table if not exists public.shared_trips (
  trip_code text primary key,
  edit_pin_hash text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security (RLS)
alter table public.shared_trips enable row level security;

-- Allow read-only SELECT by trip_code (no login required, view-safe)
drop policy if exists "Allow public read by trip_code" on public.shared_trips;
create policy "Allow public read by trip_code"
  on public.shared_trips
  for select
  using (true);

-- Block direct client INSERT / UPDATE / DELETE (must go through PIN-verified RPC)
revoke insert, update, delete on public.shared_trips from anon, authenticated;

-- Server-side PIN-verified upsert RPC
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
  where trip_code = v_code;

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
    where trip_code = v_code;
  end if;

  return jsonb_build_object('ok', true, 'trip_code', v_code, 'updated_at', now());
end;
$$;

grant execute on function public.create_or_mutate_trip(text, text, jsonb) to anon, authenticated;

-- ============================================================================
-- Public Storage Bucket: `trip-assets`
-- Stores UI assets (hero cover, plan/stay/train photos, avatars, idea covers)
-- so Google Drive remains 100% clean for `Album → Photos`.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('trip-assets', 'trip-assets', true)
on conflict (id) do update
  set public = excluded.public;

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
