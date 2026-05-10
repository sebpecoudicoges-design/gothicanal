# GothiCanal - quick setup

## 1. Frontend env
Use these variables locally and on Netlify:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 2. Supabase setup
Run `supabase/setup_videos.sql` in the Supabase SQL editor.

That creates or updates:

- `public.videos`
- `public.profiles`
- `public.video_comments`
- `public.video_likes`
- `public.chat_messages`
- public storage bucket `videos`
- Realtime publication for comments, likes, and chat

## 3. Features
The site supports anonymous video uploads, optional email/password accounts, anonymous aliases, per-video likes, per-video comments, and a global instant chat.

## 4. Security note
Anonymous uploads, comments, likes, and chat inserts are intentionally allowed for this MVP. Before broad public launch, add moderation, rate limiting, abuse reporting, and stricter server-side validation.
