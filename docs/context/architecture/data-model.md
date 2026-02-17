# Data Model (Planning Level)

## Core Tables

- `families`: family workspace root
- `family_members`: membership + role (`admin`, `member`)
- `invites`: legacy invite table (not used in current app flow)
- `rooms`: family-scoped rooms (`chat`, `game`)
- `messages`: room messages
- `message_reactions`: per-user reactions for chat messages (Messenger-style)
- `games`: game session state (status, turn pointer, mapping id)
- `game_players`: per-game participants and token metadata
- `game_events`: immutable event log for deterministic replay
- `word_master_games`: Word Master game session state (turn pointer, bag, config)
- `word_master_players`: Word Master players + scores + racks (v1)
- `word_master_board_tiles`: Word Master board tiles (authoritative placements)
- `word_master_events`: Word Master immutable event log
- `cue_clash_games`: Cue Clash game session state (turn pointer, balls + pockets)
- `cue_clash_players`: Cue Clash players (order, suit assignment, fouls)
- `cue_clash_events`: Cue Clash immutable event log (includes replay payload)
- `user_profiles`: display data and selected avatar settings
- `avatar_packs`: generated pack metadata and active version

## Key Relationships

- `families 1 -> many family_members`
- `families 1 -> many invites` (legacy)
- `families 1 -> many rooms`
- `rooms 1 -> many messages`
- `messages 1 -> many message_reactions`
- `rooms 1 -> many games` (for game rooms)
- `games 1 -> many game_players`
- `games 1 -> many game_events`
- `rooms 1 -> many word_master_games`
- `word_master_games 1 -> many word_master_players`
- `word_master_games 1 -> many word_master_board_tiles`
- `word_master_games 1 -> many word_master_events`
- `rooms 1 -> many cue_clash_games`
- `cue_clash_games 1 -> many cue_clash_players`
- `cue_clash_games 1 -> many cue_clash_events`
- `user_profiles 1 -> many avatar_packs`

## Notes

- All family-visible rows carry `family_id` for RLS scoping.
- Authoritative game state mutations are done in Edge Functions, not direct client writes.
- Key authoritative game event types in current flow:
  - `game_started`
  - `roll_move`
  - `game_ended`
- Word Master event types:
  - `game_started`
  - `turn_played`
  - `turn_passed`
  - `game_ended`
- Cue Clash event types:
  - `game_started`
  - `shot_taken`
  - `game_ended`
- Public RPC wrapper functions are exposed for PostgREST/Edge invocation and delegate to `app.*` functions with hardened execution context.
- `user_profiles.cinematics_enabled` controls cinematic camera behavior in game rendering.
- Avatar originals are stored in Storage bucket `avatar-originals` under `<family_id>/<user_id>/original.<ext>`.
