-- GothiCanal MVP video repository setup
-- Run this in Supabase SQL Editor before using the upload/search/player features.

create extension if not exists pgcrypto;

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text,
  storage_path text not null unique,
  public_url text not null,
  created_at timestamptz not null default now()
);

alter table public.videos enable row level security;

-- Public read for the gallery/player.
drop policy if exists "Public read videos" on public.videos;
create policy "Public read videos"
  on public.videos
  for select
  to anon, authenticated
  using (true);

-- MVP public insert. Tighten this before opening the site broadly.
drop policy if exists "Public insert videos" on public.videos;
create policy "Public insert videos"
  on public.videos
  for insert
  to anon, authenticated
  with check (true);

insert into storage.buckets (id, name, public)
values ('videos', 'videos', true)
on conflict (id) do nothing;

-- Public read from storage bucket.
drop policy if exists "Public read storage videos" on storage.objects;
create policy "Public read storage videos"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'videos');

-- MVP public upload to storage bucket. Tighten this before opening the site broadly.
drop policy if exists "Public upload storage videos" on storage.objects;
create policy "Public upload storage videos"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'videos');
