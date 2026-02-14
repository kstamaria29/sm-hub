# Snakes & Ladders UI Layout (v1)

## Shared Requirements

- Show active player and turn status prominently.
- Keep primary actions large and easy to tap.
- Preserve readability for ages 30-65.

## Portrait Layout

- Board occupies upper section with square fit.
- Bottom panel contains turn indicator, dice action, and player strip.
- Transient event banner appears above action area (snake/ladder/win).

## Landscape Layout

- Board anchored on left, controls and player list on right.
- Right panel keeps roll action, turn state, and expression status visible.
- Avoid hidden navigation gestures during active turn actions.

## Responsiveness

- No logic differences between orientations.
- Only camera framing and panel arrangement may change.
- Minimum touch target: 44x44 dp.
