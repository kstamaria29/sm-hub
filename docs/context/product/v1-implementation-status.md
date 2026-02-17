# v1 Implementation Status

Last updated: 2026-02-17

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
- Messenger-style reactions are implemented via `message_reactions` (👍 ❤️ 😂 😮 😢 😡).

### Game (Snakes and Ladders)

- Games tab includes a hub/selector for multiple games.
- Fixed classic mapping board rendered for Snakes & Ladders.
- Board skin selector implemented with `Family`, `Tropical`, and `Space` themes.
- User-selected board skin is persisted in `user_profiles.board_skin_id`.
- Tropical skin now renders art assets from:
  - `assets/boards/tropical/board_base.png`
  - `assets/boards/tropical/overlay_snakes_ladders.png`
  - `assets/boards/tropical/thumbnail.png`
- Authoritative game lifecycle implemented:
  - start game (`game-start` -> `start_game_v1`)
  - roll turn (`game-roll-move` -> `roll_game_turn_v1`)
  - end game (`game-end` -> `end_game_v1`)
- Event log rendering and banner summaries are implemented.
- Player expression display is derived from server events and game status.

Temporary testing mode:

- Migration `202602150005_allow_single_player_game_for_testing.sql` allows one-player game starts.
- This is a temporary testing convenience and should be reverted for production multiplayer rules.

### Game (Word Master)

- Word Master is implemented as a Scrabble-like game with server-authoritative moves.
- Authoritative lifecycle implemented:
  - start game (`word-master-start` → `word_master_start_v1`)
  - play tiles (`word-master-play` → `word_master_play_turn_v1`)
  - pass (`word-master-pass` → `word_master_pass_turn_v1`)
  - end game (`word-master-end` → `word_master_end_game_v1`)
- Drag-and-drop from rack to board is implemented (tap-to-place remains supported).
- Scrabble-like scoring is implemented:
  - main word + cross words
  - bonus squares (`DL`, `TL`, `DW`, `TW`) applied to newly placed tiles
  - strict dictionary validation (offline ispell dictionary when available)
  - +50 bingo
- 1-player admin testing is supported.

### Game (Cue Clash)

- Cue Clash is implemented as a simplified 8-ball pool game with authoritative server-side shot simulation.
- Authoritative lifecycle implemented:
  - start game (`cue-clash-start` → RPC `cue_clash_start_v1`)
  - take shot (`cue-clash-shot` → RPC `cue_clash_take_shot_v1`)
  - end game (`cue-clash-end` → RPC `cue_clash_end_game_v1`)
- In portrait, the table view rotates for a larger, more playable layout.
- 2-player max is enforced; 1-player admin testing is supported.

### Profile and avatar flow

- Settings/Profile supports:
  - display name save
  - cinematics toggle save
  - original profile photo upload from library
  - original profile photo capture from camera
  - navigation to Avatars screen
- Avatars screen supports two-step generation:
  - Step 1: generate/regenerate `neutral` preview from original photo
  - Step 2: confirm neutral (activate style), then generate `happy`, `angry`, `crying` individually
- Users generate/regenerate `happy`, `angry`, and `crying` one at a time to avoid long waits.
- Style selection supports preset styles (Anime, Pixar, Caricature) plus a custom style text prompt.
- Avatar preview grid and latest pack summary are implemented.

### Avatar generation backend

- Edge Function `avatar-generate-pack` uses OpenAI image edits with reference images.
- Neutral is generated from `avatar-originals`.
- Remaining expressions are generated from confirmed `neutral.png`.
- Expressions are generated per request to reduce function compute pressure.
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
- `202602150007_user_profile_board_skin.sql`
- `202602160001_word_master_rooms_and_tables.sql`
- `202602160002_word_master_start_rpc.sql`
- `202602160003_word_master_play_turn_rpc.sql`
- `202602160004_word_master_pass_and_end_rpc.sql`
- `202602160005_chat_message_reactions.sql`
- `202602160006_cue_clash_rooms_and_tables.sql`
- `202602160007_cue_clash_start_rpc.sql`
- `202602160008_cue_clash_shot_rpc.sql`
- `202602160009_cue_clash_end_rpc.sql`
- `202602170001_word_master_dictionary_and_bonuses.sql`
- `202602170002_word_master_play_turn_scoring.sql`
- `202602170003_word_master_dictionary_fallback_table.sql`

## Active Edge Functions

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

Legacy/not used in current app flow:

- `invite-accept`

## Next implementation steps

1. Reinstate minimum two-player start requirement after test phase.
2. Add explicit avatar pack activation/approval UX.
3. Improve avatar generation reliability (retry strategy and clearer failed-state recovery).
4. Add RPC and edge-function integration tests for critical game/avatar/member flows.
5. Add deployment checklist automation for migrations, function deploys, and secrets validation.
