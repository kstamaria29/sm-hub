# Word Master (v1) - Data Model

Word Master uses the same “rooms as organizing unit” pattern as the rest of the app, with a dedicated game room and a server-authoritative event log.

## Room

- `rooms.slug = 'word-master'`
- `rooms.kind = 'game'`

New families get this room during `bootstrap_family_v1`.

## Tables

- `word_master_games`
  - one open game per room (`pending|active`)
  - turn pointer: `current_turn_user_id`
  - bag state: `bag text[]`
  - configuration: `board_size`, `rack_size`
- `word_master_players`
  - per-game players, `player_order`, `score`, `rack text[]` (v1)
- `word_master_board_tiles`
  - authoritative board: composite PK `(game_id, row, col)`
- `word_master_events`
  - immutable event log for UI + replay

## Authoritative APIs

Edge Functions:

- `word-master-start` → RPC `word_master_start_v1`
- `word-master-play` → RPC `word_master_play_turn_v1`
- `word-master-pass` → RPC `word_master_pass_turn_v1`
- `word-master-end` → RPC `word_master_end_game_v1`

RPCs live under `app.*` and are exposed via `public.*` wrappers for PostgREST resolution.

## RLS

- Read: authenticated family members (`app.is_family_member(family_id)`).
- Write: service-role only for Word Master state tables (Edge Functions/RPCs).

Chat reactions are separate (`message_reactions`) and are written directly by authenticated members under RLS constraints.

