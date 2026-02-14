# Snakes & Ladders Rules (v1)

## Session Lifecycle

- Admin starts game sessions from the family game room.
- Admin may end/cancel an open game session.
- Only one open (`pending` or `active`) game is allowed per game room.

## Turn Rules

- Only players in `game_players` can act.
- Current turn is tracked server-side in `games.current_turn_user_id`.
- One roll per turn; duplicate roll attempts are rejected.
- Backend applies move atomically and emits an event.

Player count rule:

- Temporary testing mode currently allows one-player starts.
- Production target rule is minimum two active players.

## Win Condition

- Exact-100 rule is enabled by default.
- If a move overshoots tile 100, the token does not move.
- First player to land exactly on 100 wins and game status becomes `finished`.

## Authoritative Flow

1. Client requests roll via Edge Function.
2. Edge Function validates membership and turn ownership.
3. Edge Function computes dice, movement, snake/ladder jump, and next turn.
4. Edge Function writes game state + `game_events` in a single transaction.
5. Clients render the server-confirmed result.

Related authoritative actions:

- Start game: `game-start` -> `start_game_v1`
- Roll move: `game-roll-move` -> `roll_game_turn_v1`
- End game: `game-end` -> `end_game_v1`

## Animation Policy

- Base movement: fast tile-by-tile hops.
- Cinematics are limited to dice roll, snake transition, and ladder transition.
- Setting `cinematics_enabled` controls zoom/pan/camera effects.
- `cinematics_enabled = off`: keep token movement, disable cinematic camera effects.
- `cinematics_enabled = on`: enable limited cinematic moments.
- Animations must replay deterministically from server-confirmed outcomes.
