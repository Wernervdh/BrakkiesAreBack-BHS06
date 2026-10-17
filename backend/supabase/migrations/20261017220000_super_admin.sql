-- =====================================================================
-- BrakkeBack BHS '06 - Super admin
-- Runs after 20261017180000_log_out_and_back_in.sql. Keeps all data. Re-runnable.
--
--   * A second, separate code (the super admin code). Logging in with it creates an
--     organiser session that is also a super admin.
--   * Only super admins can build the Facebook pack (shortlist photos).
--     Regular organisers keep every other organiser tool.
--   * Regular organisers cannot remove a super admin session.
--   * Set the code from the SQL editor (never commit it):
--       select private.set_super_admin_code('a-different-long-secret');
-- =====================================================================

alter table public.profiles add column if not exists is_super_admin boolean not null default false;
alter table public.profiles drop constraint if exists profiles_super_admin_is_organizer;
alter table public.profiles add constraint profiles_super_admin_is_organizer check (not is_super_admin or is_organizer);

alter table private.settings add column if not exists super_admin_code_hash text;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_super_admin from public.profiles p where p.id = public.current_profile_id()), false);
$$;

-- Run from the SQL editor only. The two codes must differ.
create or replace function private.set_super_admin_code(code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if code is null or char_length(code) < 10 then
    raise exception 'Use a code of at least 10 characters.';
  end if;
  if exists (
    select 1 from private.settings s
    where s.organizer_code_hash is not null and extensions.crypt(code, s.organizer_code_hash) = s.organizer_code_hash
  ) then
    raise exception 'The super admin code must be different from the organiser code.';
  end if;
  update private.settings set super_admin_code_hash = extensions.crypt(code, extensions.gen_salt('bf'));
  delete from private.organizer_code_attempts;
end;
$$;

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
  if exists (
    select 1 from private.settings s
    where s.super_admin_code_hash is not null and extensions.crypt(code, s.super_admin_code_hash) = s.super_admin_code_hash
  ) then
    raise exception 'The organiser code must be different from the super admin code.';
  end if;
  update private.settings set organizer_code_hash = extensions.crypt(code, extensions.gen_salt('bf'));
  delete from private.organizer_code_attempts;
end;
$$;

-- ---------------------------------------------------------------------
-- Organiser login: the organiser code → organiser; the super admin code → super admin.
-- Returns null when the code matches neither (attempt is recorded).
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
  v_super_hash text;
  v_super boolean;
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

  select s.organizer_code_hash, s.super_admin_code_hash into v_hash, v_super_hash from private.settings s;
  v_super := v_super_hash is not null and p_code is not null and extensions.crypt(p_code, v_super_hash) = v_super_hash;
  if not v_super and (v_hash is null or p_code is null or extensions.crypt(p_code, v_hash) <> v_hash) then
    insert into private.organizer_code_attempts (user_id) values (v_uid);
    return null;
  end if;

  if v_super then
    v_name := regexp_replace(v_name, '^Organiser ', 'Super admin ');
  end if;

  select p.* into v_profile from public.profiles p where lower(p.display_name) = lower(v_name);
  if found then
    if not v_profile.is_organizer then
      raise exception 'Someone with this name has already checked in.' using errcode = 'P0001';
    end if;
    update public.profiles set is_super_admin = v_super where id = v_profile.id returning * into v_profile;
  else
    begin
      insert into public.profiles (id, display_name, is_organizer, is_super_admin)
      values (
        case when exists (select 1 from public.profiles p where p.id = v_uid) then gen_random_uuid() else v_uid end,
        v_name,
        true,
        v_super
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
-- Facebook pack: super admins only.
-- ---------------------------------------------------------------------
create or replace function public.set_photo_shortlisted(target uuid, value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can do this.' using errcode = '42501';
  end if;
  update public.photos set shortlisted = value where id = target;
end;
$$;

-- ---------------------------------------------------------------------
-- Regular organisers cannot remove a super admin session.
-- ---------------------------------------------------------------------
drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated
  using (
    id = public.current_profile_id()
    or (public.is_organizer() and (not is_super_admin or public.is_super_admin()))
  );

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;
revoke all on function public.organizer_login(text, text) from public, anon;
grant execute on function public.organizer_login(text, text) to authenticated;
revoke all on function public.set_photo_shortlisted(uuid, boolean) from public, anon;
grant execute on function public.set_photo_shortlisted(uuid, boolean) to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
