# Backend: Supabase

The app has no server of its own; Supabase is the backend (Postgres + Row Level Security, anonymous Auth, Realtime, Storage).

- `supabase/migrations/20261017000000_secure_rebuild.sql`: the full schema, security policies, RPC functions, realtime and storage setup. Re-runnable. **Running it deletes all app data.**
- `supabase/migrations/20261017120000_organiser_accounts.sql`: separate moderator-only organiser accounts (organiser login, no posting/hearts/votes for organisers). Keeps data; run after the rebuild.
- `supabase/migrations/20261017180000_log_out_and_back_in.sql`: log out without losing posts; log back in with the same name + email Profiles are linked to logins through `private.profile_sessions`. Keeps data.
- `supabase/migrations/20261017220000_super_admin.sql`: second code for a super admin, who alone can build the Facebook pack; regular organisers can't remove a super admin session. Keeps data; run last.
- `supabase/migrations/20261016000000_init_reunion_schema.sql`: the original (insecure) schema, kept for history. The rebuild drops everything it created.
- `supabase/seed.sql`: how to set the organiser and super admin codes.

See the setup steps in the root [README.md](../README.md#setup-one-time-supabase-dashboard).
