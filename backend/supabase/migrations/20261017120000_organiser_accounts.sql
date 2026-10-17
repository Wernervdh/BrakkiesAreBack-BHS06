-- =====================================================================
-- BrakkeBack BHS '06 - Separate organiser (moderator) accounts
-- Runs on top of 20261017000000_secure_rebuild.sql. Keeps all data. Re-runnable.
--
--   * Organisers log in with a display name + the organiser code
--     (public.organizer_login). No email; not linked to a guest check-in.
--   * Organisers can view and delete, but cannot post, heart, vote, upload
--     or be tagged. Enforced here, not only in the app.
--   * Guests can no longer become organisers (claim_organizer / set_organizer
--     are removed). An organiser can still remove another organiser.
-- =====================================================================

drop function if exists public.claim_organizer(text);
drop function if exists public.set_organizer(uuid, boolean);

-- ---------------------------------------------------------------------
-- Organiser login: creates a moderator profile for the calling (anonymous) user.
-- Returns null when the code is wrong (so the failed attempt is recorded).
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

  select * into v_profile from public.profiles where id = v_uid;
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

  begin
    insert into public.profiles (id, display_name, is_organizer)
    values (v_uid, v_name, true)
    returning * into v_profile;
  exception
    when unique_violation then
      raise exception 'Someone with this name has already checked in.' using errcode = 'P0001';
    when check_violation then
      raise exception 'Please enter a name of 3 to 60 characters.' using errcode = 'P0001';
  end;

  return v_profile;
end;
$$;

revoke all on function public.organizer_login(text, text) from public, anon;
grant execute on function public.organizer_login(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Organisers cannot post (photos, notes, Then & Now).
-- ---------------------------------------------------------------------
create or replace function private.stamp_new_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
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
revoke all on function private.stamp_new_content() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Organisers cannot heart, vote or be tagged.
-- ---------------------------------------------------------------------
drop policy if exists photo_likes_insert on public.photo_likes;
create policy photo_likes_insert on public.photo_likes for insert to authenticated
  with check (user_id = auth.uid() and not public.is_organizer());

drop policy if exists then_now_votes_insert on public.then_now_votes;
create policy then_now_votes_insert on public.then_now_votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_organizer()
    and not exists (
      select 1 from public.then_now_entries e where e.id = entry_id and e.owner_id = auth.uid()
    )
  );

drop policy if exists photo_tags_insert on public.photo_tags;
create policy photo_tags_insert on public.photo_tags for insert to authenticated
  with check (
    exists (select 1 from public.photos ph where ph.id = photo_id and ph.owner_id = auth.uid())
    and not exists (select 1 from public.profiles pr where pr.id = profile_id and pr.is_organizer)
    and (select count(*) from public.photo_tags t where t.photo_id = photo_tags.photo_id) < 20
  );

drop policy if exists message_tags_insert on public.message_tags;
create policy message_tags_insert on public.message_tags for insert to authenticated
  with check (
    exists (select 1 from public.messages m where m.id = message_id and m.owner_id = auth.uid())
    and not exists (select 1 from public.profiles pr where pr.id = profile_id and pr.is_organizer)
    and (select count(*) from public.message_tags t where t.message_id = message_tags.message_id) < 20
  );

-- ---------------------------------------------------------------------
-- Organisers cannot upload files.
-- ---------------------------------------------------------------------
drop policy if exists "reunion_media_insert_own" on storage.objects;
create policy "reunion_media_insert_own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'reunion-media'
    and (storage.foldername(name))[1] in ('photos', 'then-now')
    and (storage.foldername(name))[2] = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    and exists (select 1 from public.profiles p where p.id = auth.uid() and not p.is_organizer)
  );
