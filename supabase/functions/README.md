# Edge Functions (Scaffold)

- `family-bootstrap`: atomically creates family + admin membership + default rooms
- `family-member-create`: admin creates member auth account + family membership with temporary password
- `game-roll-move`: authoritative Snakes & Ladders turn executor
- `avatar-generate-pack`: server-side avatar pack generation orchestrator

All functions validate bearer auth and call transactional server logic via service-role RPC.

`avatar-generate-pack` also requires `OPENAI_API_KEY` (and optionally `OPENAI_IMAGE_MODEL`) in the function environment.
