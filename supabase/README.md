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
10. `supabase/migrations/202602150007_user_profile_board_skin.sql`
11. `supabase/migrations/202602160001_word_master_rooms_and_tables.sql`
12. `supabase/migrations/202602160002_word_master_start_rpc.sql`
13. `supabase/migrations/202602160003_word_master_play_turn_rpc.sql`
14. `supabase/migrations/202602160004_word_master_pass_and_end_rpc.sql`
15. `supabase/migrations/202602160005_chat_message_reactions.sql`
16. `supabase/migrations/202602160006_cue_clash_rooms_and_tables.sql`
17. `supabase/migrations/202602160007_cue_clash_start_rpc.sql`
18. `supabase/migrations/202602160008_cue_clash_shot_rpc.sql`
19. `supabase/migrations/202602160009_cue_clash_end_rpc.sql`
20. `supabase/migrations/202602170001_word_master_dictionary_and_bonuses.sql`
21. `supabase/migrations/202602170002_word_master_play_turn_scoring.sql`
22. `supabase/migrations/202602170003_word_master_dictionary_fallback_table.sql`
23. `supabase/storage/001_avatar_buckets.sql`
24. `supabase/tests/rls_hardening.sql` (verification script; includes `rollback`)

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
- `word-master-start`
- `word-master-play`
- `word-master-pass`
- `word-master-end`
- `cue-clash-start`
- `cue-clash-shot`
- `cue-clash-end`
- `avatar-generate-pack`

## Structure

- `migrations/` - Postgres schema, constraints, indexes, and RLS policies
- `storage/` - storage bucket and object policy SQL
- `functions/` - edge functions for authoritative game and avatar generation actions
- `tests/` - SQL checks for RLS and privilege hardening

## Verification Checklist

- [ ] SQL scripts apply cleanly in Dashboard SQL Editor
- [ ] All v1 tables exist (`families`, `family_members`, `invites`, `rooms`, `messages`, `games`, `game_players`, `game_events`, `user_profiles`, `avatar_packs`)
- [ ] Word Master tables exist (`word_master_games`, `word_master_players`, `word_master_board_tiles`, `word_master_events`)
- [ ] Chat reactions table exists (`message_reactions`)
- [ ] Cue Clash tables exist (`cue_clash_games`, `cue_clash_players`, `cue_clash_events`)
- [ ] RLS is enabled for family-scoped tables
- [ ] Storage buckets exist: `avatar-packs`, `avatar-originals`
- [ ] `avatar-packs` write path is service-role/edge-function only
- [ ] `family-bootstrap` creates family + admin + default rooms atomically
- [ ] `family-member-create` creates auth user + family member atomically
- [ ] `game-start` starts exactly one active game session per room
- [ ] `game-roll-move` executes transactional authoritative roll/move RPC
- [ ] `word-master-start` starts exactly one active Word Master session per room
- [ ] `word-master-play` executes transactional authoritative turn placement RPC
- [ ] Word Master dictionary validation works (either ispell dictionary available or `word_master_dictionary_words` is seeded)
- [ ] `cue-clash-start` starts exactly one active Cue Clash session per room (2 players max; 1-player admin test allowed)
- [ ] `cue-clash-shot` executes authoritative shot simulation + state update
- [ ] `avatar-generate-pack` generates and uploads 4 transparent PNG expressions
- [ ] `supabase/tests/rls_hardening.sql` executes without assertion failures

## Notes

- Do not store secrets in this repository.
- Mobile client must not call OpenAI directly; avatar generation runs inside edge functions only.
- Local Docker/Supabase runtime is optional. Hosted-project workflow is supported.
