# Supabase Bootstrap (v1)

This folder contains database, RLS, storage, and edge-function scaffolding for Family Hub v1.

## Setup (Hosted Supabase, No Docker)

Run SQL manually in the Supabase Dashboard SQL Editor in this exact order:

1. `supabase/migrations/202602140001_initial_schema.sql`
2. `supabase/migrations/202602140002_transactions_and_hardening.sql`
3. `supabase/migrations/202602140003_admin_membership_and_provisioning.sql`
4. `supabase/migrations/202602150001_public_rpc_wrappers.sql`
5. `supabase/migrations/202602150002_app_schema_usage_for_service_role.sql`
6. `supabase/migrations/202602150003_rpc_execution_context_hardening.sql`
7. `supabase/migrations/202602150004_start_game_authoritative.sql`
8. `supabase/migrations/202602150005_allow_single_player_game_for_testing.sql`
9. `supabase/migrations/202602150006_end_game_authoritative.sql`
10. `supabase/storage/001_avatar_buckets.sql`
11. `supabase/tests/rls_hardening.sql` (verification script; includes `rollback`)

After SQL is applied, configure edge function secrets in Supabase:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_IMAGE_MODEL` (optional, defaults to `gpt-image-1.5`)

Deploy functions from CLI (linked to your hosted project) or Dashboard:

- `family-bootstrap`
- `family-member-create`
- `game-start`
- `game-roll-move`
- `game-end`
- `avatar-generate-pack`

## Structure

- `migrations/` - Postgres schema, constraints, indexes, and RLS policies
- `storage/` - storage bucket and object policy SQL
- `functions/` - edge functions for authoritative game and avatar generation actions
- `tests/` - SQL checks for RLS and privilege hardening

## Verification Checklist

- [ ] SQL scripts apply cleanly in Dashboard SQL Editor
- [ ] All v1 tables exist (`families`, `family_members`, `invites`, `rooms`, `messages`, `games`, `game_players`, `game_events`, `user_profiles`, `avatar_packs`)
- [ ] RLS is enabled for family-scoped tables
- [ ] Storage buckets exist: `avatar-packs`, `avatar-originals`
- [ ] `avatar-packs` write path is service-role/edge-function only
- [ ] `family-bootstrap` creates family + admin + default rooms atomically
- [ ] `family-member-create` creates auth user + family member atomically
- [ ] `game-start` starts exactly one active game session per room
- [ ] `game-roll-move` executes transactional authoritative roll/move RPC
- [ ] `avatar-generate-pack` generates and uploads 4 transparent PNG expressions
- [ ] `supabase/tests/rls_hardening.sql` executes without assertion failures

## Notes

- Do not store secrets in this repository.
- Mobile client must not call OpenAI directly; avatar generation runs inside edge functions only.
- Local Docker/Supabase runtime is optional. Hosted-project workflow is supported.
