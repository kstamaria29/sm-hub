# Word Master (v1) - UI Layout

Portrait-first layout (primary target is mobile phones):

## Screen sections

1. **Header**
   - Back button
   - Title: “Word Master”
   - Status chips: `Active`, `Your turn`, and `Turn: <name>`
   - Recent-play chip (e.g. `HELLO (+12)`) when available

2. **Scoreboard**
   - Compact player chips (name + score)
   - Highlight the current-turn player

3. **Board**
   - Square board with fixed aspect ratio
   - Center star visible on empty center square
   - Placed tiles show letter + points
   - Draft (unsubmitted) tiles are visually highlighted

4. **Rack + actions**
   - “Your Tiles” rack row
   - Buttons: `Clear`, `Pass`, `Submit`
   - Admin-only: `End Game`

## Interaction

- Tap a rack tile to select it, then tap a board square to place.
- Tap a draft tile on the board to remove it from the draft.
- Long moves are validated server-side; client should keep draft when server rejects and show the error.

## Animations (v1)

- Rack tile selection: subtle scale/press spring.
- Draft placement: subtle “pop” (spring) on placement.
- Keep animations deterministic and driven by server-confirmed results for submitted turns.

