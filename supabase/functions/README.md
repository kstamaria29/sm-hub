# Edge Functions (Scaffold)

- `family-bootstrap`: atomically creates family + admin membership + default rooms
- `family-member-create`: admin creates member auth account + family membership with temporary password
- `game-start`: admin starts a new authoritative Snakes & Ladders session in the family game room
- `game-roll-move`: authoritative Snakes & Ladders turn executor
- `game-end`: admin ends/cancels the current authoritative game session
- `avatar-generate-pack`: server-side avatar pack generation orchestrator (neutral-first supported; uses uploaded original profile image as reference)

All functions validate bearer auth and call transactional server logic via service-role RPC.

`avatar-generate-pack` also requires `OPENAI_API_KEY` in the function environment.
Optional generation tuning env vars:
- `OPENAI_IMAGE_MODEL` (default: `gpt-image-1.5`)
- `OPENAI_IMAGE_QUALITY` (global override: `low|medium|high`)
- `OPENAI_IMAGE_QUALITY_NEUTRAL` (default when no global override: `low`)
- `OPENAI_IMAGE_QUALITY_EXPRESSIONS` (default when no global override: `medium`)
For the two-step avatar flow, client calls can request only `neutral` first, then request `happy`/`angry`/`crying` after user confirmation.
