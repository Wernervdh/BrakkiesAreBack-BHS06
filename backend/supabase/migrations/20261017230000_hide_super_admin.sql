-- =====================================================================
-- BrakkeBack BHS '06 - Hide the super admin from everyone else
-- Runs after 20261017220000_super_admin.sql. Keeps all data. Re-runnable.
--
-- The super admin's profile row is only readable by the super admin itself:
-- guests and regular organisers can't see it in the app, through the API
-- (browser developer tools) or in live updates.
-- =====================================================================

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (not is_super_admin or id = public.current_profile_id());
