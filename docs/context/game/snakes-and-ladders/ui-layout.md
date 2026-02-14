# Snakes & Ladders UI Layout (v1)

## Shared Requirements

- Show active player and turn status prominently.
- Keep primary actions large and easy to tap.
- Preserve readability for ages 30-65.
- Ensure screen is vertically scrollable so actions (Start/Roll/End) are reachable on small devices.

## Portrait Layout

- Board card appears before actions and event list.
- Action panel contains Start New Game, Roll Dice, and End Game.
- Player list and recent events appear below actions.
- Transient event banner appears above action area (snake/ladder/win).

## Landscape Layout

- Board column is anchored on left and detail/action column on right.
- Right panel keeps actions, players, and recent events visible.
- Avoid hidden navigation gestures during active turn actions.

## Responsiveness

- No logic differences between orientations.
- Only camera framing and panel arrangement may change.
- Minimum touch target: 44x44 dp.
