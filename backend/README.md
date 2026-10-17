# Backend: Supabase

The app has no server of its own; Supabase is the backend (Postgres + Row Level Security, anonymous Auth, Realtime, Storage).

- `supabase/migrations/20261017000000_secure_rebuild.sql`: the full schema, security policies, RPC functions, realtime and storage setup. Re-runnable. **Running it deletes all app data.**
- `supabase/migrations/20261016000000_init_reunion_schema.sql`: the original (insecure) schema, kept for history. The rebuild drops everything it created.
- `supabase/seed.sql`: how to set the organiser code.

See the setup steps in the root [README.md](../README.md#setup-one-time-supabase-dashboard).
