# BrakkeBack BHS '06 - Backend Setup (Supabase)

This backend folder holds the Supabase infrastructure configuration, database migrations, seed data, and Edge Functions for the **BrakkeBack BHS '06 (Matrix 2006 • 20 Jaar Reünie)** application.

## Directory Structure
- `supabase/migrations/`: SQL migration files defining `profiles`, `photos`, `messages`, `then_now_profiles`, RLS policies, RPC functions, and realtime replication.
- `supabase/seed.sql`: Realistic starter data for testing the Brackenfell High 20-year reunion feed.
- `supabase/functions/post-event-digest/`: Supabase Edge function for post-reunion email digests using Resend.
- `.env.example`: Template for environment variables.

## How to Apply to Supabase
1. **Via Supabase CLI:**
   ```bash
   supabase init
   supabase link --project-ref <your-project-ref>
   supabase db push
   supabase db reset --seed # optionally seed data
   ```

2. **Via Supabase Dashboard SQL Editor:**
   - Copy and paste the contents of `supabase/migrations/20261016000000_init_reunion_schema.sql` into the Supabase SQL editor and execute.
   - Run `supabase/seed.sql` to populate sample memories and photos.
   - Verify that the storage bucket `reunion-media` is marked public.
