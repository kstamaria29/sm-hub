# Word Master (v1) - Rules

Word Master is a Scrabble-like, family-friendly word board game designed for portrait mobile play and server-authoritative turns.

## Board + tiles

- Board: **11x11** (odd size; center is a star).
- Rack: **7 tiles** per player.
- Bag: English Scrabble-like distribution (A–Z, no blanks).
- Tile points: standard Scrabble letter points.

## Turn flow

On your turn you can:

1. **Play tiles**: place 1+ tiles from your rack onto empty board squares.
2. **Pass**: skip your turn (no score change).

Admin can also:

- **Start game** (select players; **1-player allowed** for testing).
- **End game** (manual end/cancel).

## Placement rules (server enforced)

- Tiles placed in a single turn must be in the **same row** or the **same column**.
- The final word line must be **contiguous** (no gaps), allowing existing tiles to fill the gaps.
- **First move** must cross the **center star** and must form a word (so it effectively requires 2+ tiles).
- **Subsequent moves** must **connect** to at least one existing tile (N/E/S/W adjacency).

## Scoring (v1)

v1 scoring is “Scrabble-ish” but intentionally simplified for reliability:

- Score is the sum of letter points for the **main word(s)** formed:
  - Multi-tile moves score the main word along the placement direction.
  - Single-tile moves may score **both** horizontal and vertical words if they form length > 1.
- **No board multipliers** (double letter/word) in v1.
- **Bingo bonus**: +50 points when using all 7 tiles in a single move.
- Dictionary validation is **not enforced** in v1 (casual mode).

## Events

The server writes an immutable event log:

- `game_started`
- `turn_played`
- `turn_passed`
- `game_ended`

Clients should render state and animations based on server-confirmed outcomes only.

