-- =====================================================================
-- BrakkeBack BHS '06 - Activity log (super admin only)
-- Runs after 20261017230000_hide_super_admin.sql. Keeps all data. Re-runnable.
--
--   * public.activity_log records who did what and when: check-ins, log-ins,
--     log-outs, failed logins, posts, deletes, hearts, votes, tags, moderation
--     and admin actions.
--   * Only the super admin can read it. Nobody can insert, change or delete
--     entries through the API; only these database functions write to it.
--   * No emails, photo files or note texts are stored.
--   * When a guest uses "Leave & delete my data", their name in the log is
--     replaced by "(deleted guest)". When an organiser removes a guest, the
--     log keeps the name (accountability).
--   * Rows deleted as a side effect (a removed guest's photos, the votes on a
--     deleted entry...) are not logged one by one: a delete is skipped when the
--     photo / entry / person it belonged to is already gone. The parent entry
--     covers it.
-- =====================================================================

create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  category text not null,   -- session | security | content | reaction | tag | moderation | admin
  action text not null,     -- e.g. photo.created
  actor_id uuid,            -- profile that did it (null = not logged in / deleted guest)
  actor_name text,
  actor_role text,          -- guest | organiser | super admin
  subject_id uuid,          -- profile the entry is about (photo owner, tagged guest, removed guest...)
  summary text not null
);
create index if not exists activity_log_at_idx on public.activity_log (id desc);

alter table public.activity_log enable row level security;
revoke all on public.activity_log from public, anon, authenticated;
grant select on public.activity_log to authenticated;
drop policy if exists activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log for select to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function private.profile_name(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name from public.profiles p where p.id = p_id;
$$;

create or replace function private.log_activity(
  p_category text,
  p_action text,
  p_summary text,
  p_subject uuid default null,
  p_actor uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(p_actor, public.current_profile_id());
  v_name text;
  v_org boolean;
  v_super boolean;
begin
  select p.display_name, p.is_organizer, p.is_super_admin into v_name, v_org, v_super
    from public.profiles p where p.id = v_actor;
  insert into public.activity_log (category, action, actor_id, actor_name, actor_role, subject_id, summary)
  values (
    p_category,
    p_action,
    case when v_name is null then null else v_actor end,
    v_name,
    case when v_super then 'super admin' when v_org then 'organiser' when v_name is not null then 'guest' end,
    p_subject,
    p_summary
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Posts: photos, notes, Then & Now (created / deleted / shortlisted)
-- ---------------------------------------------------------------------
create or replace function private.log_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_actor_name text := coalesce(private.profile_name(v_actor), 'Someone');
  v_kind text := case tg_table_name when 'photos' then 'photo' when 'messages' then 'note' else 'Then & Now entry' end;
  v_key text := case tg_table_name when 'photos' then 'photo' when 'messages' then 'note' else 'then_now' end;
  v_extra text := '';
begin
  if tg_op = 'INSERT' then
    if tg_table_name = 'photos' then
      v_extra := format(' (#%s)', new.prompt_tag);
    elsif tg_table_name = 'messages' then
      v_extra := format(' (%s)', case new.category when 'thank_you' then 'Thank You' when 'memory' then 'Memory' else '30th Prediction' end);
    end if;
    perform private.log_activity('content', v_key || '.created',
      format('%s posted a %s%s', new.author_name, v_kind, v_extra), new.owner_id, new.owner_id);

  elsif tg_op = 'DELETE' then
    -- The owner was removed / left: covered by that entry.
    if not exists (select 1 from public.profiles p where p.id = old.owner_id) then
      return null;
    end if;
    if v_actor = old.owner_id then
      perform private.log_activity('content', v_key || '.deleted',
        format('%s deleted their %s', old.author_name, v_kind), old.owner_id);
    else
      perform private.log_activity('moderation', v_key || '.removed',
        format('%s deleted a %s by %s', v_actor_name, v_kind, old.author_name), old.owner_id);
    end if;

  elsif tg_op = 'UPDATE' and tg_table_name = 'photos' and old.shortlisted is distinct from new.shortlisted then
    perform private.log_activity('admin', case when new.shortlisted then 'photo.shortlisted' else 'photo.unshortlisted' end,
      format('%s %s a photo by %s %s the Facebook pack', v_actor_name,
        case when new.shortlisted then 'added' else 'removed' end, new.author_name,
        case when new.shortlisted then 'to' else 'from' end),
      new.owner_id);
  end if;
  return null;
end;
$$;

drop trigger if exists photos_log on public.photos;
create trigger photos_log after insert or delete or update of shortlisted on public.photos
  for each row execute function private.log_content();
drop trigger if exists messages_log on public.messages;
create trigger messages_log after insert or delete on public.messages
  for each row execute function private.log_content();
drop trigger if exists then_now_entries_log on public.then_now_entries;
create trigger then_now_entries_log after insert or delete on public.then_now_entries
  for each row execute function private.log_content();

-- ---------------------------------------------------------------------
-- Hearts and votes
-- ---------------------------------------------------------------------
create or replace function private.log_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_owner uuid;
  v_owner_name text;
  v_user_name text;
begin
  v_user := case when tg_op = 'INSERT' then new.user_id else old.user_id end;
  if tg_op = 'DELETE' and not exists (select 1 from public.profiles p where p.id = old.user_id) then
    return null; -- the person was removed / left
  end if;
  v_user_name := coalesce(private.profile_name(v_user), 'Someone');

  if tg_table_name = 'photo_likes' then
    select ph.owner_id, ph.author_name into v_owner, v_owner_name from public.photos ph
      where ph.id = case when tg_op = 'INSERT' then new.photo_id else old.photo_id end;
    if not found then
      return null; -- the photo was deleted
    end if;
    perform private.log_activity('reaction',
      case when tg_op = 'INSERT' then 'heart.added' else 'heart.removed' end,
      case when tg_op = 'INSERT'
        then format('%s gave a heart to a photo by %s', v_user_name, coalesce(v_owner_name, '?'))
        else format('%s removed their heart from a photo by %s', v_user_name, coalesce(v_owner_name, '?')) end,
      v_owner, v_user);
  else
    select e.owner_id, e.author_name into v_owner, v_owner_name from public.then_now_entries e
      where e.id = case when tg_op = 'INSERT' then new.entry_id else old.entry_id end;
    if not found then
      return null; -- the entry was deleted
    end if;
    perform private.log_activity('reaction',
      case when tg_op = 'INSERT' then 'vote.added' else 'vote.removed' end,
      case when tg_op = 'INSERT'
        then format('%s voted "Most Changed" for %s', v_user_name, coalesce(v_owner_name, '?'))
        else format('%s took back their "Most Changed" vote for %s', v_user_name, coalesce(v_owner_name, '?')) end,
      v_owner, v_user);
  end if;
  return null;
end;
$$;

drop trigger if exists photo_likes_log on public.photo_likes;
create trigger photo_likes_log after insert or delete on public.photo_likes
  for each row execute function private.log_reaction();
drop trigger if exists then_now_votes_log on public.then_now_votes;
create trigger then_now_votes_log after insert or delete on public.then_now_votes
  for each row execute function private.log_reaction();

-- ---------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------
create or replace function private.log_tag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_actor_name text := coalesce(private.profile_name(v_actor), 'Someone');
  v_tagged uuid := case when tg_op = 'INSERT' then new.profile_id else old.profile_id end;
  v_tagged_name text := coalesce(private.profile_name(v_tagged), '?');
  v_owner uuid;
  v_owner_name text;
  v_kind text := case tg_table_name when 'photo_tags' then 'photo' else 'note' end;
begin
  if tg_table_name = 'photo_tags' then
    select ph.owner_id, ph.author_name into v_owner, v_owner_name from public.photos ph
      where ph.id = case when tg_op = 'INSERT' then new.photo_id else old.photo_id end;
  else
    select m.owner_id, m.author_name into v_owner, v_owner_name from public.messages m
      where m.id = case when tg_op = 'INSERT' then new.message_id else old.message_id end;
  end if;
  if not found or (tg_op = 'DELETE' and not exists (select 1 from public.profiles p where p.id = old.profile_id)) then
    return null; -- the photo / note or the tagged person is gone
  end if;

  if tg_op = 'INSERT' then
    perform private.log_activity('tag', 'tag.added',
      format('%s tagged %s in a %s', v_actor_name, v_tagged_name, v_kind), v_tagged);
  elsif v_actor = v_tagged then
    perform private.log_activity('tag', 'tag.removed',
      format('%s removed their tag from a %s by %s', v_actor_name, v_kind, coalesce(v_owner_name, '?')), v_tagged);
  else
    perform private.log_activity(case when v_actor = v_owner then 'tag' else 'moderation' end, 'tag.removed',
      format('%s removed %s''s tag from a %s by %s', v_actor_name, v_tagged_name, v_kind, coalesce(v_owner_name, '?')), v_tagged);
  end if;
  return null;
end;
$$;

drop trigger if exists photo_tags_log on public.photo_tags;
create trigger photo_tags_log after insert or delete on public.photo_tags
  for each row execute function private.log_tag();
drop trigger if exists message_tags_log on public.message_tags;
create trigger message_tags_log after insert or delete on public.message_tags
  for each row execute function private.log_tag();

-- ---------------------------------------------------------------------
-- Profiles: leaving, organiser log-out, removals (before the delete, so the
-- actor is still known)
-- ---------------------------------------------------------------------
create or replace function private.log_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_actor_name text := coalesce(private.profile_name(v_actor), 'Someone');
  v_role text := case when old.is_super_admin then 'Super admin' when old.is_organizer then 'Organiser' else 'Guest' end;
begin
  if v_actor = old.id and old.is_organizer then
    perform private.log_activity('session', 'organiser.logged_out', format('%s logged out', old.display_name), old.id);
  elsif v_actor = old.id then
    -- Leave & delete my data: forget the name everywhere in the log.
    update public.activity_log
      set actor_name = case when actor_id = old.id then '(deleted guest)' else actor_name end,
          actor_id = case when actor_id = old.id then null else actor_id end,
          summary = replace(summary, old.display_name, '(deleted guest)'),
          subject_id = case when subject_id = old.id then null else subject_id end
      where actor_id = old.id or subject_id = old.id;
    -- No actor: the guest asked to be forgotten.
    insert into public.activity_log (category, action, summary)
    values ('session', 'guest.left', 'A guest left and deleted all their data');
  elsif old.is_organizer then
    perform private.log_activity('moderation', 'organiser.removed',
      format('%s ended the session of %s %s', v_actor_name, lower(v_role), old.display_name), old.id);
  else
    perform private.log_activity('moderation', 'guest.removed',
      format('%s removed guest %s and everything they posted', v_actor_name, old.display_name), old.id);
  end if;
  return old;
end;
$$;

drop trigger if exists profiles_log_delete on public.profiles;
create trigger profiles_log_delete before delete on public.profiles
  for each row execute function private.log_profile_delete();

-- ---------------------------------------------------------------------
-- Story published / hidden
-- ---------------------------------------------------------------------
create or replace function private.log_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.story_published is distinct from new.story_published then
    perform private.log_activity('admin', case when new.story_published then 'story.published' else 'story.hidden' end,
      format('%s %s the Story', coalesce(private.profile_name(public.current_profile_id()), 'Someone'),
        case when new.story_published then 'published' else 'hid' end));
  end if;
  return null;
end;
$$;

drop trigger if exists app_settings_log on public.app_settings;
create trigger app_settings_log after update on public.app_settings
  for each row execute function private.log_settings();

-- ---------------------------------------------------------------------
-- Log-out (manual or after 30 minutes without activity)
-- ---------------------------------------------------------------------
drop function if exists public.end_session();
create or replace function public.end_session(p_reason text default 'logged_out')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_name text := private.profile_name(v_profile);
begin
  if v_name is not null then
    perform private.log_activity('session',
      case when p_reason = 'inactive' then 'session.idle_logout' else 'session.logout' end,
      case when p_reason = 'inactive'
        then format('%s was logged out after 30 minutes without activity', v_name)
        else format('%s logged out', v_name) end,
      v_profile);
  end if;
  delete from private.profile_sessions where auth_uid = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------
-- Guest check-in / log back in (same as before + logging)
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
  v_other_device boolean;
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
      if not v_profile.is_organizer then
        perform private.log_activity('security', 'login.failed',
          format('Failed log-in as %s (wrong email)', v_profile.display_name), v_profile.id, null);
      end if;
      return null;
    end if;
    v_other_device := exists (select 1 from private.profile_sessions s where s.profile_id = v_profile.id and s.auth_uid <> v_uid);
    perform private.link_session(v_profile.id);
    perform private.log_activity('session', 'session.login',
      format('%s logged back in%s', v_profile.display_name,
        case when v_other_device then ' (their other device was logged out)' else '' end),
      v_profile.id);
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
  perform private.log_activity('session', 'guest.checked_in', format('%s checked in', v_profile.display_name), v_profile.id);
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------
-- Organiser / super admin login (same as before + logging)
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
    perform private.log_activity('security', 'organiser.login_failed', 'Failed organiser login (wrong code)', null, null);
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
  perform private.log_activity('session', case when v_super then 'super_admin.login' else 'organiser.login' end,
    format('%s logged in', v_profile.display_name), v_profile.id);
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------
revoke all on function public.end_session(text) from public, anon;
grant execute on function public.end_session(text) to authenticated;
revoke all on function public.check_in(text, text) from public, anon;
grant execute on function public.check_in(text, text) to authenticated;
revoke all on function public.organizer_login(text, text) from public, anon;
grant execute on function public.organizer_login(text, text) to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
