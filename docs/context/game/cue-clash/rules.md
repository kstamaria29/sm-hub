# Cue Clash (v1) - Rules + Authoritative Flow

Cue Clash is a family-friendly, simplified 8-ball pool game.

## Players

- Maximum players: **2**
- Testing mode: **1-player** start is allowed (admin-only start) to support development/polish.

## Turn flow (authoritative)

1. The current player aims a shot (direction + power).
2. The client sends the shot to an Edge Function.
3. The server simulates the shot (ball collisions, cushions, pockets) and stores:
   - updated ball positions/pocketed mask
   - next turn pointer
   - an immutable event with a replay payload used by clients for animation
4. Clients render the replay animation and then the stored final state.

## 8-ball rules (simplified v1)

### Open table / suit assignment

- The table starts **open** (no solids/stripes assigned).
- On a clean shot where a player pockets a non-8 ball, suits are assigned:
  - first pocketed solid ⇒ shooter becomes **Solids**, opponent becomes **Stripes**
  - first pocketed stripe ⇒ shooter becomes **Stripes**, opponent becomes **Solids**

### Continuing a turn

- If you pocket at least one ball of your suit on a clean shot, you continue.
- On an open table, pocketing any non-8 ball on a clean shot continues your turn.

### Fouls (v1)

- **Scratch**: cue ball is pocketed.
- **No contact**: cue ball does not contact any object ball.
- **Hit 8 first on open table**: first contact is the 8-ball before suits are assigned.
- **Wrong first contact** (after suit assignment):
  - you must contact one of your remaining suit balls first
  - once you have no suit balls remaining, you may contact the 8-ball first

Cue-ball handling on scratch (v1):

- Cue ball is **respotted** near the head area. (Ball-in-hand placement is not implemented in v1.)

### Winning / losing

- Pocketing the 8-ball **wins** only if:
  - suits are assigned for the shooter, and
  - the shooter has **no remaining balls** of their suit, and
  - the shot is **not** a foul
- Otherwise, pocketing the 8-ball ends the game as a loss (opponent wins when present).

