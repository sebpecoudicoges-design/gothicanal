-- GothiCanal private library and internal messaging migration.
-- Run in Supabase SQL Editor after setup_videos.sql.

create extension if not exists pgcrypto;

alter table public.videos
  add column if not exists visibility text not null default 'public';

alter table public.videos
  add column if not exists storage_bucket text not null default 'videos';

alter table public.videos
  alter column public_url drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'videos_visibility_check'
  ) then
    alter table public.videos
      add constraint videos_visibility_check
      check (visibility in ('public', 'private'));
  end if;
end $$;

create table if not exists public.video_shares (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  shared_with_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (video_id, shared_with_user_id)
);

create table if not exists public.direct_threads (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  participant_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (owner_user_id <> participant_user_id),
  unique (owner_user_id, participant_user_id)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.direct_threads (id) on delete cascade,
  sender_user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1200),
  created_at timestamptz not null default now()
);

create index if not exists videos_owner_visibility_idx
  on public.videos (owner_user_id, visibility, created_at desc);

create index if not exists video_shares_shared_with_idx
  on public.video_shares (shared_with_user_id, created_at desc);

create index if not exists direct_messages_thread_created_idx
  on public.direct_messages (thread_id, created_at asc);

alter table public.video_shares enable row level security;
alter table public.direct_threads enable row level security;
alter table public.direct_messages enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.profiles to anon, authenticated;
grant select, insert, update on public.videos to anon, authenticated;
grant select, insert, delete on public.video_shares to authenticated;
grant select, insert, update on public.direct_threads to authenticated;
grant select, insert on public.direct_messages to authenticated;
grant all on public.video_shares to service_role;
grant all on public.direct_threads to service_role;
grant all on public.direct_messages to service_role;

drop policy if exists "Read visible videos" on public.videos;
drop policy if exists "Public read videos" on public.videos;
create policy "Read visible videos"
  on public.videos for select
  to anon, authenticated
  using (
    visibility = 'public'
    or owner_user_id = auth.uid()
    or exists (
      select 1
      from public.video_shares
      where video_shares.video_id = videos.id
        and video_shares.shared_with_user_id = auth.uid()
    )
  );

drop policy if exists "Insert public or owned videos" on public.videos;
drop policy if exists "Public insert videos" on public.videos;
create policy "Insert public or owned videos"
  on public.videos for insert
  to anon, authenticated
  with check (
    (visibility = 'public' and (owner_user_id is null or owner_user_id = auth.uid()))
    or (visibility = 'private' and owner_user_id = auth.uid())
  );

drop policy if exists "Owners update videos" on public.videos;
create policy "Owners update videos"
  on public.videos for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners and recipients read shares" on public.video_shares;
create policy "Owners and recipients read shares"
  on public.video_shares for select
  to authenticated
  using (owner_user_id = auth.uid() or shared_with_user_id = auth.uid());

drop policy if exists "Owners share own videos" on public.video_shares;
create policy "Owners share own videos"
  on public.video_shares for insert
  to authenticated
  with check (
    owner_user_id = auth.uid()
    and exists (
      select 1
      from public.videos
      where videos.id = video_shares.video_id
        and videos.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Owners remove own shares" on public.video_shares;
create policy "Owners remove own shares"
  on public.video_shares for delete
  to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "Participants read threads" on public.direct_threads;
create policy "Participants read threads"
  on public.direct_threads for select
  to authenticated
  using (owner_user_id = auth.uid() or participant_user_id = auth.uid());

drop policy if exists "Users create own threads" on public.direct_threads;
create policy "Users create own threads"
  on public.direct_threads for insert
  to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists "Participants update threads" on public.direct_threads;
create policy "Participants update threads"
  on public.direct_threads for update
  to authenticated
  using (owner_user_id = auth.uid() or participant_user_id = auth.uid())
  with check (owner_user_id = auth.uid() or participant_user_id = auth.uid());

drop policy if exists "Participants read direct messages" on public.direct_messages;
create policy "Participants read direct messages"
  on public.direct_messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.direct_threads
      where direct_threads.id = direct_messages.thread_id
        and (direct_threads.owner_user_id = auth.uid() or direct_threads.participant_user_id = auth.uid())
    )
  );

drop policy if exists "Participants send direct messages" on public.direct_messages;
create policy "Participants send direct messages"
  on public.direct_messages for insert
  to authenticated
  with check (
    sender_user_id = auth.uid()
    and exists (
      select 1
      from public.direct_threads
      where direct_threads.id = direct_messages.thread_id
        and (direct_threads.owner_user_id = auth.uid() or direct_threads.participant_user_id = auth.uid())
    )
  );

insert into storage.buckets (id, name, public)
values ('private-videos', 'private-videos', false)
on conflict (id) do update set public = false;

drop policy if exists "Authenticated upload private videos" on storage.objects;
create policy "Authenticated upload private videos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'private-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and lower(storage.extension(name)) in ('mp4', 'webm', 'mov', 'm4v')
  );

drop policy if exists "Private video owners and recipients read storage" on storage.objects;
create policy "Private video owners and recipients read storage"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'private-videos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.videos
        join public.video_shares on video_shares.video_id = videos.id
        where videos.storage_bucket = 'private-videos'
          and videos.storage_path = storage.objects.name
          and video_shares.shared_with_user_id = auth.uid()
      )
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.video_shares;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
