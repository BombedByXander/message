-- ============================================================
-- Blink — Supabase schema
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to re-run.
-- ============================================================

-- ---------- Tables ----------

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_.]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
-- one friendship row per pair, regardless of who asked first
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('text','snap')),
  body         text check (char_length(body) <= 2000),
  media_path   text,
  caption      text check (char_length(caption) <= 120),
  created_at   timestamptz not null default now(),
  opened_at    timestamptz
);
create index if not exists messages_sender_idx    on public.messages (sender_id, created_at desc);
create index if not exists messages_recipient_idx on public.messages (recipient_id, created_at desc);

create table if not exists public.stories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  media_path text not null,
  caption    text check (char_length(caption) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists stories_user_idx on public.stories (user_id, created_at desc);

-- ---------- Helper functions ----------

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  );
$$;

-- same check, but takes the other person's id as text (used by storage policies)
create or replace function public.is_friend_text(other text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id::text = other and f.addressee_id = auth.uid())
        or (f.addressee_id::text = other and f.requester_id = auth.uid()))
  );
$$;

-- lets the sign-up form check a username before creating the account
create or replace function public.username_available(uname text)
returns boolean language sql security definer set search_path = public stable as $$
  select not exists (select 1 from public.profiles where username = lower(uname));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- marks a snap as opened (recipients can't update messages directly)
create or replace function public.open_snap(msg_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.messages
     set opened_at = now()
   where id = msg_id and recipient_id = auth.uid() and kind = 'snap' and opened_at is null;
$$;
grant execute on function public.open_snap(uuid) to authenticated;

-- ---------- New user → profile ----------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uname text := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  dname text := coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), uname);
begin
  insert into public.profiles (id, username, display_name) values (new.id, uname, left(dname, 40));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row level security ----------

alter table public.profiles    enable row level security;
alter table public.friendships enable row level security;
alter table public.messages    enable row level security;
alter table public.stories     enable row level security;

-- profiles: anyone signed in can find people; you can only edit yourself
drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles update" on public.profiles;
create policy "profiles read"   on public.profiles for select to authenticated using (true);
create policy "profiles update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- usernames are permanent; only these columns can be changed from the client
revoke update on public.profiles from authenticated;
grant  update (display_name, avatar_url) on public.profiles to authenticated;

-- friendships
drop policy if exists "friendships read"   on public.friendships;
drop policy if exists "friendships insert" on public.friendships;
drop policy if exists "friendships accept" on public.friendships;
drop policy if exists "friendships delete" on public.friendships;
create policy "friendships read" on public.friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy "friendships insert" on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending');
create policy "friendships accept" on public.friendships for update to authenticated
  using (addressee_id = auth.uid()) with check (addressee_id = auth.uid() and status = 'accepted');
create policy "friendships delete" on public.friendships for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
revoke update on public.friendships from authenticated;
grant  update (status) on public.friendships to authenticated;

-- messages
drop policy if exists "messages read"   on public.messages;
drop policy if exists "messages insert" on public.messages;
drop policy if exists "messages delete" on public.messages;
create policy "messages read" on public.messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy "messages insert" on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and opened_at is null
    and public.are_friends(sender_id, recipient_id)
    and (
      (kind = 'text' and char_length(btrim(coalesce(body, ''))) > 0 and media_path is null)
      or
      (kind = 'snap' and media_path like (auth.uid()::text || '/%'))
    )
  );
create policy "messages delete" on public.messages for delete to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- stories: visible to you and your friends for 24 hours
drop policy if exists "stories read"   on public.stories;
drop policy if exists "stories insert" on public.stories;
drop policy if exists "stories delete" on public.stories;
create policy "stories read" on public.stories for select to authenticated
  using (
    created_at > now() - interval '24 hours'
    and (user_id = auth.uid() or public.are_friends(auth.uid(), user_id))
  );
create policy "stories insert" on public.stories for insert to authenticated
  with check (user_id = auth.uid() and media_path like (auth.uid()::text || '/%'));
create policy "stories delete" on public.stories for delete to authenticated
  using (user_id = auth.uid());

-- ---------- Storage ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true,  2097152, array['image/jpeg','image/png','image/webp']),
  ('snaps',   'snaps',   false, 8388608, array['image/jpeg']),
  ('stories', 'stories', false, 8388608, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- avatars: public to view, each user writes inside their own folder
drop policy if exists "avatars insert" on storage.objects;
drop policy if exists "avatars delete" on storage.objects;
create policy "avatars insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- snaps: path is  <sender id>/<recipient id>/<file>.jpg
--   sender can always read; recipient can read only until the snap is opened
drop policy if exists "snaps insert" on storage.objects;
drop policy if exists "snaps read"   on storage.objects;
drop policy if exists "snaps delete" on storage.objects;
create policy "snaps insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'snaps' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "snaps read" on storage.objects for select to authenticated
  using (
    bucket_id = 'snaps' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.messages m
        where m.media_path = objects.name and m.recipient_id = auth.uid() and m.opened_at is null
      )
    )
  );
create policy "snaps delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'snaps' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.messages m
        where m.media_path = objects.name and m.recipient_id = auth.uid()
      )
    )
  );

-- stories: path is  <owner id>/<file>.jpg ; owner and friends can read
drop policy if exists "stories insert" on storage.objects;
drop policy if exists "stories read"   on storage.objects;
drop policy if exists "stories delete" on storage.objects;
create policy "stories insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "stories read" on storage.objects for select to authenticated
  using (
    bucket_id = 'stories' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_friend_text((storage.foldername(name))[1])
    )
  );
create policy "stories delete" on storage.objects for delete to authenticated
  using (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Realtime ----------

do $$ begin alter publication supabase_realtime add table public.messages;    exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.friendships; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.stories;     exception when duplicate_object then null; end $$;

-- ============================================================
-- Optional: tidy up expired stories every hour (needs pg_cron:
-- Dashboard → Database → Extensions → enable "pg_cron", then run).
--
-- select cron.schedule('blink-expire-stories', '0 * * * *',
--   $$ delete from public.stories where created_at < now() - interval '24 hours' $$);
-- ============================================================
