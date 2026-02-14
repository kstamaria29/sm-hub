# Avatar Expressions in Game (v1)

## Expression Set

- neutral
- happy
- angry
- crying

## Trigger Matrix

- Default movement or idle: `neutral`
- Ladder event: `happy` for about 2 seconds
- Snake event: `angry` for about 2 seconds
- Big snake drop (20+ tiles): `crying` for about 2 seconds
- Win state: winner `happy`, others `crying` for about 2-3 seconds

## Consistency Rules

- Expressions are derived from server-confirmed events.
- Expression art comes from avatar packs only (transparent PNGs).
- Client does not invent new expression states.
- Avatar generation is neutral-first in current UX:
  - generate/confirm `neutral` first
  - generate `happy`, `angry`, `crying` after neutral confirmation
