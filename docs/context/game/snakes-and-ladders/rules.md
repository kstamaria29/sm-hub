# Snakes & Ladders Rules (v1)

## Turn Rules

- Only players in `game_players` can act.
- Current turn is tracked server-side in `games.current_turn_user_id`.
- One roll per turn; duplicate roll attempts are rejected.
- Backend applies move atomically and emits an event.

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

## Animation Policy

- Base movement: fast tile-by-tile hops.
- Cinematics are limited to dice roll, snake transition, and ladder transition.
- Setting `cinematics_enabled` controls zoom/pan/camera effects.
- `cinematics_enabled = off`: keep token movement, disable cinematic camera effects.
- `cinematics_enabled = on`: enable limited cinematic moments.
- Animations must replay deterministically from server-confirmed outcomes.
