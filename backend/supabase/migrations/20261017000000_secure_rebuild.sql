-- =====================================================================
-- BrakkeBack BHS '06 - Secure rebuild
-- Matric 2006 • 20-Year Reunion (Brackenfell High)
--
-- !! WARNING: drops and recreates every app table. All rows are deleted. !!
--
-- Security model
--   * Every phone gets an anonymous Supabase Auth user (no password).
--   * A profile row is keyed by auth.uid(), so one device = one guest.
--   * Check-in requires an email, but the address itself is never stored:
--     only an HMAC-SHA256 fingerprint (secret key in private.settings), used
--     solely to allow one check-in per email. Nobody can read it back.
--   * Rows are owned by auth.uid(); only the owner or an organiser can delete.
--   * Deleting a profile (guest leaves, or an organiser removes them) cascades
--     to everything they posted: photos, notes, Then & Now, likes and votes.
--     The app removes their storage files first (photos/<uid>/, then-now/<uid>/).
--   * Author names, owners and counters are stamped by the database, never
--     trusted from the client.
--   * Likes / votes are rows with a (item, user) primary key, so one per user.
--   * Organiser rights come from a secret code (stored bcrypt-hashed in the
--     non-exposed "private" schema) or from another organiser.
--
-- Before using the app (Supabase dashboard):
--   1. Authentication > Sign In / Providers > enable "Anonymous sign-ins".
--   2. Run this file in the SQL editor.
--   3. Set the organiser code (never commit it):
--        select private.set_organizer_code('your-long-secret-code');
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 0. Remove the old, insecure schema
-- ---------------------------------------------------------------------
-- Policies and tables first: they depend on public.is_organizer().
drop policy if exists "Public Read Reunion Media" on storage.objects;
drop policy if exists "Public Insert Reunion Media" on storage.objects;
drop policy if exists "reunion_media_select_own" on storage.objects;
drop policy if exists "reunion_media_insert_own" on storage.objects;
drop policy if exists "reunion_media_delete_own" on storage.objects;

drop table if exists private.email_fingerprints;

drop table if exists
  public.app_settings,
  public.photo_tags,
  public.message_tags,
  public.then_now_votes,
  public.then_now_entries,
  public.then_now_profiles,
  public.photo_likes,
  public.photos,
  public.messages,
  public.profiles
  cascade;

drop function if exists public.increment_photo_likes(uuid);
drop function if exists public.increment_then_now_vote(uuid);
drop function if exists public.claim_organizer(text);
drop function if exists public.set_organizer(uuid, boolean);
drop function if exists public.set_story_published(boolean);
drop function if exists public.set_photo_shortlisted(uuid, boolean);
drop function if exists public.check_in(text, text);
drop function if exists public.is_organizer();

-- ---------------------------------------------------------------------
-- 1. Private schema (not exposed through the API)
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table if not exists private.settings (
  singleton boolean primary key default true check (singleton),
  organizer_code_hash text
);
insert into private.settings default values on conflict do nothing;
-- Secret key for email fingerprints. Generated once; never leaves the database.
alter table private.settings
  add column if not exists email_pepper text not null default encode(extensions.gen_random_bytes(32), 'hex');

create table if not exists private.organizer_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  display_name text not null,
  is_organizer boolean not null default false,
  constraint profiles_display_name_length check (char_length(display_name) between 3 and 60),
  constraint profiles_display_name_clean check (display_name = btrim(display_name) and display_name !~ '\s{2,}')
);
create unique index profiles_display_name_unique on public.profiles (lower(display_name));

-- One check-in per email. Only a keyed fingerprint is stored, never the address.
-- Lives in the private schema: not reachable through the API by anyone.
create table private.email_fingerprints (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  fingerprint text not null unique
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  author_name text not null default '',
  prompt_tag text not null,
  caption text,
  image_path text not null unique,
  likes_count integer not null default 0,
  -- Organisers' shortlist for the Facebook pack.
  shortlisted boolean not null default false,
  constraint photos_prompt_tag check (prompt_tag in (
    'Mid-laugh', 'Unchanged', 'Best Dance Move', 'Group Hug', 'Brakkie Pride', 'Golden Oldies', 'Squad'
  )),
  constraint photos_caption_length check (caption is null or char_length(caption) <= 140)
);
create index photos_created_at_idx on public.photos (created_at desc);

create table public.photo_likes (
  photo_id uuid not null references public.photos (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  author_name text not null default '',
  content text not null,
  category text not null,
  constraint messages_content_length check (char_length(btrim(content)) between 1 and 500),
  constraint messages_category check (category in ('thank_you', 'memory', 'prediction_30th'))
);
create index messages_created_at_idx on public.messages (created_at desc);

-- App-wide switches, readable by every guest, changed only through organiser RPCs.
create table public.app_settings (
  singleton boolean primary key default true check (singleton),
  story_published boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.app_settings default values;

-- Tags: only checked-in guests (profiles) can be tagged.
create table public.photo_tags (
  photo_id uuid not null references public.photos (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, profile_id)
);

create table public.message_tags (
  message_id uuid not null references public.messages (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);

-- One Then & Now entry per guest.
create table public.then_now_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_id uuid not null unique default auth.uid() references public.profiles (id) on delete cascade,
  author_name text not null default '',
  then_path text not null,
  now_path text not null,
  votes_count integer not null default 0
);

create table public.then_now_votes (
  entry_id uuid not null references public.then_now_entries (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id)
);

-- ---------------------------------------------------------------------
-- 3. Helper functions
-- ---------------------------------------------------------------------
create or replace function public.is_organizer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_organizer from public.profiles p where p.id = auth.uid()), false);
$$;

-- Stamps owner, author name and counters on new content and rate-limits posting.
create or replace function private.stamp_new_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_recent integer;
begin
  select p.display_name into v_name from public.profiles p where p.id = v_uid;
  if v_name is null then
    raise exception 'Please check in before posting.' using errcode = '42501';
  end if;

  new.owner_id := v_uid;
  new.author_name := v_name;
  new.created_at := now();

  if tg_table_name = 'photos' then
    new.likes_count := 0;
    new.shortlisted := false;
    new.caption := nullif(btrim(new.caption), '');
    if new.image_path not like 'photos/' || v_uid::text || '/%' then
      raise exception 'Invalid image path.' using errcode = '42501';
    end if;
    select count(*) into v_recent from public.photos
      where owner_id = v_uid and created_at > now() - interval '10 minutes';
    if v_recent >= 20 then
      raise exception 'You are posting very fast. Please wait a few minutes.' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'messages' then
    new.content := btrim(new.content);
    select count(*) into v_recent from public.messages
      where owner_id = v_uid and created_at > now() - interval '10 minutes';
    if v_recent >= 10 then
      raise exception 'You are posting very fast. Please wait a few minutes.' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'then_now_entries' then
    new.votes_count := 0;
    if new.then_path not like 'then-now/' || v_uid::text || '/%'
       or new.now_path not like 'then-now/' || v_uid::text || '/%' then
      raise exception 'Invalid image path.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger photos_stamp before insert on public.photos
  for each row execute function private.stamp_new_content();
create trigger messages_stamp before insert on public.messages
  for each row execute function private.stamp_new_content();
create trigger then_now_entries_stamp before insert on public.then_now_entries
  for each row execute function private.stamp_new_content();

-- Keeps likes_count / votes_count in sync with the like / vote rows.
create or replace function private.sync_counter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'photo_likes' then
    if tg_op = 'INSERT' then
      update public.photos set likes_count = likes_count + 1 where id = new.photo_id;
    else
      update public.photos set likes_count = greatest(likes_count - 1, 0) where id = old.photo_id;
    end if;
  else
    if tg_op = 'INSERT' then
      update public.then_now_entries set votes_count = votes_count + 1 where id = new.entry_id;
    else
      update public.then_now_entries set votes_count = greatest(votes_count - 1, 0) where id = old.entry_id;
    end if;
  end if;
  return null;
end;
$$;

create trigger photo_likes_sync after insert or delete on public.photo_likes
  for each row execute function private.sync_counter();
create trigger then_now_votes_sync after insert or delete on public.then_now_votes
  for each row execute function private.sync_counter();

-- Check-in: creates the caller's profile and records the email fingerprint atomically.
create or replace function public.check_in(p_display_name text, p_email text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g');
  v_fingerprint text;
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'Please check in first.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if found then
    return v_profile;
  end if;

  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.' using errcode = 'P0001';
  end if;

  select encode(extensions.hmac(v_email, s.email_pepper, 'sha256'), 'hex') into v_fingerprint
    from private.settings s;

  begin
    insert into public.profiles (id, display_name) values (v_uid, v_name) returning * into v_profile;
    insert into private.email_fingerprints (profile_id, fingerprint) values (v_uid, v_fingerprint);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'email_fingerprints_fingerprint_key' then
      raise exception 'This email address was already used to check in on another phone.' using errcode = 'P0001';
    end if;
    raise exception 'Someone with this name has already checked in.' using errcode = 'P0001';
  when check_violation then
    raise exception 'Please enter your name and surname (3 to 60 characters).' using errcode = 'P0001';
  end;

  return v_profile;
end;
$$;

-- Organiser code: claim organiser rights for the calling guest.
create or replace function public.claim_organizer(code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_mine integer;
  v_all integer;
begin
  if v_uid is null or not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Please check in first.' using errcode = '42501';
  end if;

  select count(*) into v_mine from private.organizer_code_attempts
    where user_id = v_uid and attempted_at > now() - interval '15 minutes';
  select count(*) into v_all from private.organizer_code_attempts
    where attempted_at > now() - interval '15 minutes';
  if v_mine >= 5 or v_all >= 50 then
    raise exception 'Too many attempts. Please try again later.' using errcode = 'P0001';
  end if;

  select organizer_code_hash into v_hash from private.settings;
  if v_hash is null or code is null or extensions.crypt(code, v_hash) <> v_hash then
    insert into private.organizer_code_attempts (user_id) values (v_uid);
    return false;
  end if;

  update public.profiles set is_organizer = true where id = v_uid;
  return true;
end;
$$;

-- Organisers can grant / revoke organiser rights for other guests.
create or replace function public.set_organizer(target uuid, make_organizer boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_organizer() then
    raise exception 'Only organisers can do this.' using errcode = '42501';
  end if;
  if target = auth.uid() and not make_organizer then
    raise exception 'You cannot remove your own organiser rights.' using errcode = 'P0001';
  end if;
  update public.profiles set is_organizer = make_organizer where id = target;
end;
$$;

-- Organisers shortlist photos for the Facebook pack.
create or replace function public.set_photo_shortlisted(target uuid, value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_organizer() then
    raise exception 'Only organisers can do this.' using errcode = '42501';
  end if;
  update public.photos set shortlisted = value where id = target;
end;
$$;

-- Organisers publish / hide the Story page.
create or replace function public.set_story_published(publish boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_organizer() then
    raise exception 'Only organisers can do this.' using errcode = '42501';
  end if;
  update public.app_settings set story_published = publish, updated_at = now();
end;
$$;

-- Run from the SQL editor only: select private.set_organizer_code('...');
create or replace function private.set_organizer_code(code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if code is null or char_length(code) < 10 then
    raise exception 'Use a code of at least 10 characters.';
  end if;
  update private.settings set organizer_code_hash = extensions.crypt(code, extensions.gen_salt('bf'));
  delete from private.organizer_code_attempts;
end;
$$;

revoke all on function public.check_in(text, text) from public, anon;
grant execute on function public.check_in(text, text) to authenticated;
revoke all on function public.is_organizer() from public, anon;
revoke all on function public.claim_organizer(text) from public, anon;
revoke all on function public.set_organizer(uuid, boolean) from public, anon;
grant execute on function public.is_organizer() to authenticated;
grant execute on function public.claim_organizer(text) to authenticated;
grant execute on function public.set_organizer(uuid, boolean) to authenticated;
revoke all on function public.set_photo_shortlisted(uuid, boolean) from public, anon;
grant execute on function public.set_photo_shortlisted(uuid, boolean) to authenticated;
revoke all on function public.set_story_published(boolean) from public, anon;
grant execute on function public.set_story_published(boolean) to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Table privileges (anon gets nothing; authenticated only what it needs)
-- ---------------------------------------------------------------------
revoke all on private.email_fingerprints from public, anon, authenticated;
revoke all on public.profiles, public.photos, public.photo_likes,
  public.photo_tags, public.messages, public.message_tags, public.then_now_entries,
  public.then_now_votes from anon, authenticated;

revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;
grant select, insert, delete on public.photo_tags to authenticated;
grant select, insert, delete on public.message_tags to authenticated;

-- No insert: profiles are only created through public.check_in().
grant select, delete on public.profiles to authenticated;
grant select, insert, delete on public.photos to authenticated;
grant select, insert, delete on public.photo_likes to authenticated;
grant select, insert, delete on public.messages to authenticated;
grant select, insert, delete on public.then_now_entries to authenticated;
grant select, insert, delete on public.then_now_votes to authenticated;

-- ---------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table private.email_fingerprints enable row level security;
alter table public.photos enable row level security;
alter table public.photo_likes enable row level security;
alter table public.messages enable row level security;
alter table public.then_now_entries enable row level security;
alter table public.then_now_votes enable row level security;
alter table public.photo_tags enable row level security;
alter table public.message_tags enable row level security;
alter table public.app_settings enable row level security;

create policy app_settings_select on public.app_settings for select to authenticated using (true);

-- photo_tags / message_tags: the poster tags (max 20 per item); the tagged guest,
-- the poster or an organiser can remove a tag.
create policy photo_tags_select on public.photo_tags for select to authenticated using (true);
create policy photo_tags_insert on public.photo_tags for insert to authenticated
  with check (
    exists (select 1 from public.photos ph where ph.id = photo_id and ph.owner_id = auth.uid())
    and (select count(*) from public.photo_tags t where t.photo_id = photo_tags.photo_id) < 20
  );
create policy photo_tags_delete on public.photo_tags for delete to authenticated
  using (
    profile_id = auth.uid()
    or public.is_organizer()
    or exists (select 1 from public.photos ph where ph.id = photo_id and ph.owner_id = auth.uid())
  );

create policy message_tags_select on public.message_tags for select to authenticated using (true);
create policy message_tags_insert on public.message_tags for insert to authenticated
  with check (
    exists (select 1 from public.messages m where m.id = message_id and m.owner_id = auth.uid())
    and (select count(*) from public.message_tags t where t.message_id = message_tags.message_id) < 20
  );
create policy message_tags_delete on public.message_tags for delete to authenticated
  using (
    profile_id = auth.uid()
    or public.is_organizer()
    or exists (select 1 from public.messages m where m.id = message_id and m.owner_id = auth.uid())
  );

-- profiles
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_delete on public.profiles for delete to authenticated
  using (id = auth.uid() or public.is_organizer());

-- photos
create policy photos_select on public.photos for select to authenticated using (true);
create policy photos_insert on public.photos for insert to authenticated
  with check (owner_id = auth.uid());
create policy photos_delete on public.photos for delete to authenticated
  using (owner_id = auth.uid() or public.is_organizer());

-- photo_likes (a guest only sees their own likes; totals live on photos.likes_count)
create policy photo_likes_select on public.photo_likes for select to authenticated
  using (user_id = auth.uid());
create policy photo_likes_insert on public.photo_likes for insert to authenticated
  with check (user_id = auth.uid());
create policy photo_likes_delete on public.photo_likes for delete to authenticated
  using (user_id = auth.uid());

-- messages
create policy messages_select on public.messages for select to authenticated using (true);
create policy messages_insert on public.messages for insert to authenticated
  with check (owner_id = auth.uid());
create policy messages_delete on public.messages for delete to authenticated
  using (owner_id = auth.uid() or public.is_organizer());

-- then_now_entries
create policy then_now_entries_select on public.then_now_entries for select to authenticated using (true);
create policy then_now_entries_insert on public.then_now_entries for insert to authenticated
  with check (owner_id = auth.uid());
create policy then_now_entries_delete on public.then_now_entries for delete to authenticated
  using (owner_id = auth.uid() or public.is_organizer());

-- then_now_votes (no voting for yourself)
create policy then_now_votes_select on public.then_now_votes for select to authenticated
  using (user_id = auth.uid());
create policy then_now_votes_insert on public.then_now_votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and not exists (
      select 1 from public.then_now_entries e where e.id = entry_id and e.owner_id = auth.uid()
    )
  );
create policy then_now_votes_delete on public.then_now_votes for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6. Realtime
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['profiles', 'photos', 'messages', 'then_now_entries', 'photo_tags', 'message_tags', 'app_settings'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Storage: public bucket, images only, 5 MB, uploads only into own folder
--    Paths: photos/<auth.uid()>/<file>.jpg and then-now/<auth.uid()>/<file>.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reunion-media', 'reunion-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No public listing policy: files are reachable only by their (unguessable) URL.
create policy "reunion_media_select_own" on storage.objects for select to authenticated
  using (
    bucket_id = 'reunion-media'
    and ((storage.foldername(name))[2] = auth.uid()::text or public.is_organizer())
  );

create policy "reunion_media_insert_own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'reunion-media'
    and (storage.foldername(name))[1] in ('photos', 'then-now')
    and (storage.foldername(name))[2] = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    and exists (select 1 from public.profiles p where p.id = auth.uid())
  );

create policy "reunion_media_delete_own" on storage.objects for delete to authenticated
  using (
    bucket_id = 'reunion-media'
    and ((storage.foldername(name))[2] = auth.uid()::text or public.is_organizer())
  );
