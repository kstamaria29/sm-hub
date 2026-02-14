# v1 Implementation Status

Last updated: 2026-02-15

## Implemented

### Authentication and onboarding

- Email/password account creation and sign-in via Supabase Auth.
- Onboarding gate states:
  - `needs_auth` for sign-in/sign-up
  - `needs_family` for first family bootstrap
  - `ready` for app tabs
- Family bootstrap via Edge Function `family-bootstrap`, backed by RPC `bootstrap_family_v1`.

### Family membership management

- Role model in active flow is `admin` and `member`.
- Invite-join UX removed; `invites` table remains legacy data.
- Admin member provisioning implemented in Settings/Profile:
  - admin inputs member email and optional display name
  - Edge Function `family-member-create` creates auth user
  - temporary password is generated and returned once
  - membership/profile records are created by authoritative RPC

### Chat

- Family-scoped chat room is active.
- Messages load and refresh correctly.
- Realtime updates are enabled for ongoing conversation.

### Game (Snakes and Ladders)

- Fixed classic mapping board rendered in Games screen.
- Authoritative game lifecycle implemented:
  - start game (`game-start` -> `start_game_v1`)
  - roll turn (`game-roll-move` -> `roll_game_turn_v1`)
  - end game (`game-end` -> `end_game_v1`)
- Event log rendering and banner summaries are implemented.
- Player expression display is derived from server events and game status.

Temporary testing mode:

- Migration `202602150005_allow_single_player_game_for_testing.sql` allows one-player game starts.
- This is a temporary testing convenience and should be reverted for production multiplayer rules.

### Profile and avatar flow

- Settings/Profile supports:
  - display name save
  - cinematics toggle save
  - original profile photo upload from library
  - original profile photo capture from camera
  - navigation to Avatars screen
- Avatars screen supports two-step generation:
  - Step 1: generate/regenerate `neutral` preview from original photo
  - Step 2: confirm neutral and generate `happy`, `angry`, `crying`
- Avatar preview grid and latest pack summary are implemented.

### Avatar generation backend

- Edge Function `avatar-generate-pack` uses OpenAI image edits with reference images.
- Neutral is generated from `avatar-originals`.
- Remaining expressions are generated from confirmed `neutral.png`.
- Expressions are generated per request sequence to reduce function compute pressure.
- Storage path convention:
  - `avatar-packs/<family_id>/<user_id>/<style_id>/<version>/<expression>.png`

## Supabase backend milestones applied

- `202602140001_initial_schema.sql`
- `202602140002_transactions_and_hardening.sql`
- `202602140003_admin_membership_and_provisioning.sql`
- `202602150001_public_rpc_wrappers.sql`
- `202602150002_app_schema_usage_for_service_role.sql`
- `202602150003_rpc_execution_context_hardening.sql`
- `202602150004_start_game_authoritative.sql`
- `202602150005_allow_single_player_game_for_testing.sql`
- `202602150006_end_game_authoritative.sql`

## Active Edge Functions

- `family-bootstrap`
- `family-member-create`
- `game-start`
- `game-roll-move`
- `game-end`
- `avatar-generate-pack`

Legacy/not used in current app flow:

- `invite-accept`

## Next implementation steps

1. Reinstate minimum two-player start requirement after test phase.
2. Add explicit avatar pack activation/approval UX.
3. Improve avatar generation reliability (retry strategy and clearer failed-state recovery).
4. Add RPC and edge-function integration tests for critical game/avatar/member flows.
5. Add deployment checklist automation for migrations, function deploys, and secrets validation.
