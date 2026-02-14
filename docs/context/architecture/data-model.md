# Data Model (Planning Level)

## Core Tables

- `families`: family workspace root
- `family_members`: membership + role (`admin`, `member`)
- `invites`: legacy invite table (not used in current app flow)
- `rooms`: family-scoped rooms (`chat`, `game`)
- `messages`: room messages
- `games`: game session state (status, turn pointer, mapping id)
- `game_players`: per-game participants and token metadata
- `game_events`: immutable event log for deterministic replay
- `user_profiles`: display data and selected avatar settings
- `avatar_packs`: generated pack metadata and active version

## Key Relationships

- `families 1 -> many family_members`
- `families 1 -> many invites` (legacy)
- `families 1 -> many rooms`
- `rooms 1 -> many messages`
- `rooms 1 -> many games` (for game rooms)
- `games 1 -> many game_players`
- `games 1 -> many game_events`
- `user_profiles 1 -> many avatar_packs`

## Notes

- All family-visible rows carry `family_id` for RLS scoping.
- Authoritative game state mutations are done in Edge Functions, not direct client writes.
- Key authoritative game event types in current flow:
  - `game_started`
  - `roll_move`
  - `game_ended`
- Public RPC wrapper functions are exposed for PostgREST/Edge invocation and delegate to `app.*` functions with hardened execution context.
- `user_profiles.cinematics_enabled` controls cinematic camera behavior in game rendering.
- Avatar originals are stored in Storage bucket `avatar-originals` under `<family_id>/<user_id>/original.<ext>`.
