-- =====================================================================
-- BrakkeBack BHS '06 - Log out and log back in (posts are kept)
-- Runs after 20261017120000_organiser_accounts.sql. Keeps all data. Re-runnable.
--
--   * A profile is no longer tied to a single browser login.
--     private.profile_sessions links the current (anonymous) Supabase login to
--     a profile. One active login per profile: the newest login wins.
--   * Guests log back in with the exact name + email they checked in with
--     (5 wrong tries per name per 15 min). Organisers with their organiser
--     name + the organiser code.
--   * public.end_session() logs the current login out; nothing is deleted.
--   * All ownership checks now use public.current_profile_id() instead of auth.uid().
-- =====================================================================

-- ---------------------------------------------------------------------
-- Sessions and login attempts (private: not reachable through the API)
-- ---------------------------------------------------------------------
create table if not exists private.profile_sessions (
  auth_uid uuid primary key references auth.users (id) on delete cascade,
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.profile_sessions enable row level security;
revoke all on private.profile_sessions from public, anon, authenticated;

create table if not exists private.login_attempts (
  id bigint generated always as identity primary key,
  name_key text not null,
  attempted_at timestamptz not null default now()
);
alter table private.login_attempts enable row level security;
revoke all on private.login_attempts from public, anon, authenticated;

-- A profile outlives the login that created it.
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();

-- Existing check-ins keep working: link each profile to the login that created it.
-- Only once, so re-running this file never logs a logged-out device back in.
alter table private.settings add column if not exists sessions_backfilled boolean not null default false;

insert into private.profile_sessions (auth_uid, profile_id)
select p.id, p.id
from public.profiles p
where exists (select 1 from auth.users u where u.id = p.id)
  and not (select s.sessions_backfilled from private.settings s)
on conflict do nothing;

update private.settings set sessions_backfilled = true where not sessions_backfilled;

-- ---------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.profile_id from private.profile_sessions s where s.auth_uid = auth.uid();
$$;

create or replace function public.is_organizer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_organizer from public.profiles p where p.id = public.current_profile_id()), false);
$$;

create or replace function public.my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.profiles p where p.id = public.current_profile_id();
$$;

create or replace function public.end_session()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.profile_sessions where auth_uid = auth.uid();
$$;

-- Links the calling login to a profile; any other login of that profile is logged out.
create or replace function private.link_session(p_profile_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.profile_sessions where profile_id = p_profile_id or auth_uid = auth.uid();
  insert into private.profile_sessions (auth_uid, profile_id) values (auth.uid(), p_profile_id);
$$;

-- ---------------------------------------------------------------------
-- Guest check-in / log back in
-- Returns null when the name exists with a different email (attempt is recorded).
-- ---------------------------------------------------------------------
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
  v_key text;
  v_fingerprint text;
  v_existing text;
  v_constraint text;
  v_fails integer;
  v_all integer;
begin
  if v_uid is null then
    raise exception 'Please check in first.' using errcode = '42501';
  end if;

  select p.* into v_profile from public.profiles p where p.id = public.current_profile_id();
  if found then
    return v_profile;
  end if;

  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.' using errcode = 'P0001';
  end if;

  v_key := lower(v_name);
  select count(*) into v_fails from private.login_attempts
    where name_key = v_key and attempted_at > now() - interval '15 minutes';
  select count(*) into v_all from private.login_attempts
    where attempted_at > now() - interval '15 minutes';
  if v_fails >= 5 or v_all >= 200 then
    raise exception 'Too many attempts. Please try again later.' using errcode = 'P0001';
  end if;

  select encode(extensions.hmac(v_email, s.email_pepper, 'sha256'), 'hex') into v_fingerprint
    from private.settings s;

  -- Logging back in: same name (any case) and the same email as at check-in.
  select p.* into v_profile from public.profiles p where lower(p.display_name) = v_key;
  if found then
    select f.fingerprint into v_existing from private.email_fingerprints f where f.profile_id = v_profile.id;
    if v_profile.is_organizer or v_existing is distinct from v_fingerprint then
      insert into private.login_attempts (name_key) values (v_key);
      return null;
    end if;
    perform private.link_session(v_profile.id);
    return v_profile;
  end if;

  -- New guest.
  if exists (select 1 from private.email_fingerprints f where f.fingerprint = v_fingerprint) then
    raise exception 'This email address was already used with a different name. Use the exact name you checked in with.'
      using errcode = 'P0001';
  end if;

  begin
    insert into public.profiles (id, display_name)
    values (
      case when exists (select 1 from public.profiles p where p.id = v_uid) then gen_random_uuid() else v_uid end,
      v_name
    )
    returning * into v_profile;
    insert into private.email_fingerprints (profile_id, fingerprint) values (v_profile.id, v_fingerprint);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'email_fingerprints_fingerprint_key' then
        raise exception 'This email address was already used with a different name. Use the exact name you checked in with.'
          using errcode = 'P0001';
      end if;
      raise exception 'Someone with this name has already checked in.' using errcode = 'P0001';
    when check_violation then
      raise exception 'Please enter your name and surname (3 to 60 characters).' using errcode = 'P0001';
  end;

  perform private.link_session(v_profile.id);
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------
-- Organiser login / log back in (name + organiser code, no email)
-- Returns null when the code is wrong (attempt is recorded).
-- ---------------------------------------------------------------------
create or replace function public.organizer_login(p_display_name text, p_code text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_name text := regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g');
  v_hash text;
  v_mine integer;
  v_all integer;
begin
  if v_uid is null then
    raise exception 'Please check in first.' using errcode = '42501';
  end if;

  select p.* into v_profile from public.profiles p where p.id = public.current_profile_id();
  if found then
    if v_profile.is_organizer then
      return v_profile;
    end if;
    raise exception 'This phone is checked in as a guest. Use another browser or phone for the organiser login.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_mine from private.organizer_code_attempts
    where user_id = v_uid and attempted_at > now() - interval '15 minutes';
  select count(*) into v_all from private.organizer_code_attempts
    where attempted_at > now() - interval '15 minutes';
  if v_mine >= 5 or v_all >= 50 then
    raise exception 'Too many attempts. Please try again later.' using errcode = 'P0001';
  end if;

  select organizer_code_hash into v_hash from private.settings;
  if v_hash is null or p_code is null or extensions.crypt(p_code, v_hash) <> v_hash then
    insert into private.organizer_code_attempts (user_id) values (v_uid);
    return null;
  end if;

  select p.* into v_profile from public.profiles p where lower(p.display_name) = lower(v_name);
  if found then
    if not v_profile.is_organizer then
      raise exception 'Someone with this name has already checked in.' using errcode = 'P0001';
    end if;
  else
    begin
      insert into public.profiles (id, display_name, is_organizer)
      values (
        case when exists (select 1 from public.profiles p where p.id = v_uid) then gen_random_uuid() else v_uid end,
        v_name,
        true
      )
      returning * into v_profile;
    exception
      when unique_violation then
        raise exception 'Someone with this name has already checked in.' using errcode = 'P0001';
      when check_violation then
        raise exception 'Please enter a name of 3 to 60 characters.' using errcode = 'P0001';
    end;
  end if;

  perform private.link_session(v_profile.id);
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------
-- Content stamping uses the current profile
-- ---------------------------------------------------------------------
create or replace function private.stamp_new_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.current_profile_id();
  v_name text;
  v_organizer boolean;
  v_recent integer;
begin
  select p.display_name, p.is_organizer into v_name, v_organizer from public.profiles p where p.id = v_uid;
  if v_name is null then
    raise exception 'Please check in before posting.' using errcode = '42501';
  end if;
  if v_organizer then
    raise exception 'Organisers can only moderate, not post.' using errcode = '42501';
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

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke all on function public.current_profile_id() from public, anon;
revoke all on function public.my_profile() from public, anon;
revoke all on function public.end_session() from public, anon;
revoke all on function public.check_in(text, text) from public, anon;
revoke all on function public.organizer_login(text, text) from public, anon;
revoke all on function public.is_organizer() from public, anon;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.end_session() to authenticated;
grant execute on function public.check_in(text, text) to authenticated;
grant execute on function public.organizer_login(text, text) to authenticated;
grant execute on function public.is_organizer() to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Defaults and policies: auth.uid() → public.current_profile_id()
-- ---------------------------------------------------------------------
alter table public.photos alter column owner_id set default public.current_profile_id();
alter table public.messages alter column owner_id set default public.current_profile_id();
alter table public.then_now_entries alter column owner_id set default public.current_profile_id();
alter table public.photo_likes alter column user_id set default public.current_profile_id();
alter table public.then_now_votes alter column user_id set default public.current_profile_id();

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated
  using (id = public.current_profile_id() or public.is_organizer());

drop policy if exists photos_insert on public.photos;
create policy photos_insert on public.photos for insert to authenticated
  with check (owner_id = public.current_profile_id());
drop policy if exists photos_delete on public.photos;
create policy photos_delete on public.photos for delete to authenticated
  using (owner_id = public.current_profile_id() or public.is_organizer());

drop policy if exists photo_likes_select on public.photo_likes;
create policy photo_likes_select on public.photo_likes for select to authenticated
  using (user_id = public.current_profile_id());
drop policy if exists photo_likes_insert on public.photo_likes;
create policy photo_likes_insert on public.photo_likes for insert to authenticated
  with check (user_id = public.current_profile_id() and not public.is_organizer());
drop policy if exists photo_likes_delete on public.photo_likes;
create policy photo_likes_delete on public.photo_likes for delete to authenticated
  using (user_id = public.current_profile_id());

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (owner_id = public.current_profile_id());
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated
  using (owner_id = public.current_profile_id() or public.is_organizer());

drop policy if exists then_now_entries_insert on public.then_now_entries;
create policy then_now_entries_insert on public.then_now_entries for insert to authenticated
  with check (owner_id = public.current_profile_id());
drop policy if exists then_now_entries_delete on public.then_now_entries;
create policy then_now_entries_delete on public.then_now_entries for delete to authenticated
  using (owner_id = public.current_profile_id() or public.is_organizer());

drop policy if exists then_now_votes_select on public.then_now_votes;
create policy then_now_votes_select on public.then_now_votes for select to authenticated
  using (user_id = public.current_profile_id());
drop policy if exists then_now_votes_insert on public.then_now_votes;
create policy then_now_votes_insert on public.then_now_votes for insert to authenticated
  with check (
    user_id = public.current_profile_id()
    and not public.is_organizer()
    and not exists (
      select 1 from public.then_now_entries e where e.id = entry_id and e.owner_id = public.current_profile_id()
    )
  );
drop policy if exists then_now_votes_delete on public.then_now_votes;
create policy then_now_votes_delete on public.then_now_votes for delete to authenticated
  using (user_id = public.current_profile_id());

drop policy if exists photo_tags_insert on public.photo_tags;
create policy photo_tags_insert on public.photo_tags for insert to authenticated
  with check (
    exists (select 1 from public.photos ph where ph.id = photo_id and ph.owner_id = public.current_profile_id())
    and not exists (select 1 from public.profiles pr where pr.id = profile_id and pr.is_organizer)
    and (select count(*) from public.photo_tags t where t.photo_id = photo_tags.photo_id) < 20
  );
drop policy if exists photo_tags_delete on public.photo_tags;
create policy photo_tags_delete on public.photo_tags for delete to authenticated
  using (
    profile_id = public.current_profile_id()
    or public.is_organizer()
    or exists (select 1 from public.photos ph where ph.id = photo_id and ph.owner_id = public.current_profile_id())
  );

drop policy if exists message_tags_insert on public.message_tags;
create policy message_tags_insert on public.message_tags for insert to authenticated
  with check (
    exists (select 1 from public.messages m where m.id = message_id and m.owner_id = public.current_profile_id())
    and not exists (select 1 from public.profiles pr where pr.id = profile_id and pr.is_organizer)
    and (select count(*) from public.message_tags t where t.message_id = message_tags.message_id) < 20
  );
drop policy if exists message_tags_delete on public.message_tags;
create policy message_tags_delete on public.message_tags for delete to authenticated
  using (
    profile_id = public.current_profile_id()
    or public.is_organizer()
    or exists (select 1 from public.messages m where m.id = message_id and m.owner_id = public.current_profile_id())
  );

-- Storage: own folder = current profile id.
drop policy if exists "reunion_media_select_own" on storage.objects;
create policy "reunion_media_select_own" on storage.objects for select to authenticated
  using (
    bucket_id = 'reunion-media'
    and ((storage.foldername(name))[2] = public.current_profile_id()::text or public.is_organizer())
  );
drop policy if exists "reunion_media_insert_own" on storage.objects;
create policy "reunion_media_insert_own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'reunion-media'
    and (storage.foldername(name))[1] in ('photos', 'then-now')
    and (storage.foldername(name))[2] = public.current_profile_id()::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    and exists (select 1 from public.profiles p where p.id = public.current_profile_id() and not p.is_organizer)
  );
drop policy if exists "reunion_media_delete_own" on storage.objects;
create policy "reunion_media_delete_own" on storage.objects for delete to authenticated
  using (
    bucket_id = 'reunion-media'
    and ((storage.foldername(name))[2] = public.current_profile_id()::text or public.is_organizer())
  );
