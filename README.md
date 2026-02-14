# sm-hub

Family Hub Expo app now lives at repository root.

## Mobile App

Environment variables:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Commands:

- `npm install`
- `npm run start`
- `npm run lint`

## Backend (Supabase)

- Use a hosted Supabase project (no Docker required).
- Run SQL files manually in Supabase Dashboard SQL Editor in this order:
  1. `supabase/migrations/202602140001_initial_schema.sql`
  2. `supabase/migrations/202602140002_transactions_and_hardening.sql`
  3. `supabase/migrations/202602140003_admin_membership_and_provisioning.sql`
  4. `supabase/storage/001_avatar_buckets.sql`
  5. `supabase/tests/rls_hardening.sql`

See `supabase/README.md` for edge function secrets and deployment checklist.
