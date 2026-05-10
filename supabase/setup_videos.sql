-- GothiCanal MVP community setup
-- Run this in Supabase SQL Editor before using the upload/search/player features.
-- Anonymous upload, comments, likes, and chat are intentionally allowed for the MVP.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  category text,
  storage_path text not null unique,
  public_url text not null,
  owner_user_id uuid references auth.users (id) on delete set null,
  owner_alias text not null default 'Anonyme' check (char_length(owner_alias) between 2 and 40),
  created_at timestamptz not null default now()
);

alter table public.videos
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null;

alter table public.videos
  add column if not exists owner_alias text not null default 'Anonyme';

create table if not exists public.video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 700),
  author_user_id uuid references auth.users (id) on delete set null,
  author_alias text not null check (char_length(author_alias) between 2 and 40),
  identity_key text not null check (char_length(identity_key) between 8 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.video_likes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  author_user_id uuid references auth.users (id) on delete set null,
  author_alias text not null check (char_length(author_alias) between 2 and 40),
  identity_key text not null check (char_length(identity_key) between 8 and 120),
  created_at timestamptz not null default now(),
  unique (video_id, identity_key)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(body) between 1 and 700),
  author_user_id uuid references auth.users (id) on delete set null,
  author_alias text not null check (char_length(author_alias) between 2 and 40),
  identity_key text not null check (char_length(identity_key) between 8 and 120),
  created_at timestamptz not null default now()
);

create index if not exists video_comments_video_created_idx
  on public.video_comments (video_id, created_at desc);

create index if not exists video_likes_video_idx
  on public.video_likes (video_id);

create index if not exists chat_messages_created_idx
  on public.chat_messages (created_at desc);

grant usage on schema public to anon, authenticated, service_role;
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select, insert on public.videos to anon, authenticated;
grant select, insert on public.video_comments to anon, authenticated;
grant select, insert, delete on public.video_likes to anon, authenticated;
grant select, insert on public.chat_messages to anon, authenticated;
grant all on public.profiles to service_role;
grant all on public.videos to service_role;
grant all on public.video_comments to service_role;
grant all on public.video_likes to service_role;
grant all on public.chat_messages to service_role;

alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.video_comments enable row level security;
alter table public.video_likes enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Public read profiles" on public.profiles;
create policy "Public read profiles"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Users create their own profile" on public.profiles;
create policy "Users create their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Public read videos" on public.videos;
create policy "Public read videos"
  on public.videos
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public insert videos" on public.videos;
create policy "Public insert videos"
  on public.videos
  for insert
  to anon, authenticated
  with check (
    owner_user_id is null
    or owner_user_id = auth.uid()
  );

drop policy if exists "Public read comments" on public.video_comments;
create policy "Public read comments"
  on public.video_comments
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public insert comments" on public.video_comments;
create policy "Public insert comments"
  on public.video_comments
  for insert
  to anon, authenticated
  with check (
    author_user_id is null
    or author_user_id = auth.uid()
  );

drop policy if exists "Public read likes" on public.video_likes;
create policy "Public read likes"
  on public.video_likes
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public insert likes" on public.video_likes;
create policy "Public insert likes"
  on public.video_likes
  for insert
  to anon, authenticated
  with check (
    author_user_id is null
    or author_user_id = auth.uid()
  );

drop policy if exists "Public delete likes" on public.video_likes;
create policy "Public delete likes"
  on public.video_likes
  for delete
  to anon, authenticated
  using (true);

drop policy if exists "Public read chat messages" on public.chat_messages;
create policy "Public read chat messages"
  on public.chat_messages
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public insert chat messages" on public.chat_messages;
create policy "Public insert chat messages"
  on public.chat_messages
  for insert
  to anon, authenticated
  with check (
    author_user_id is null
    or author_user_id = auth.uid()
  );

insert into storage.buckets (id, name, public)
values ('videos', 'videos', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read storage videos" on storage.objects;
create policy "Public read storage videos"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'videos');

drop policy if exists "Public upload storage videos" on storage.objects;
create policy "Public upload storage videos"
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'videos'
    and lower(storage.extension(name)) in ('mp4', 'webm', 'mov', 'm4v')
  );

do $$
begin
  alter publication supabase_realtime add table public.video_comments;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.video_likes;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when duplicate_object then null;
end $$;
