# GothiCanal – quick setup

## 1. Frontend env
Use these variables locally and on Netlify:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 2. Supabase setup
Run `supabase/setup_videos.sql` in the Supabase SQL editor.

That creates:
- table `public.videos`
- public storage bucket `videos`
- read/upload policies for the MVP

## 3. Upload flow
The site uploads the selected video into Supabase Storage, inserts metadata into `public.videos`, then exposes it in the searchable archive/player.

## 4. Security note
The current SQL is intentionally permissive so the MVP works immediately from the browser with the anon key.
Before opening uploads to the public, tighten the insert/storage policies and/or add authentication.
