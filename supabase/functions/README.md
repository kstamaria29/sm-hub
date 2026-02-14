# Edge Functions (Scaffold)

- `family-bootstrap`: atomically creates family + owner membership + default rooms
- `invite-accept`: accepts an invite token using transaction-safe DB logic
- `game-roll-move`: authoritative Snakes & Ladders turn executor
- `avatar-generate-pack`: server-side avatar pack generation orchestrator

All functions validate bearer auth and call transactional server logic via service-role RPC.

`avatar-generate-pack` also requires `OPENAI_API_KEY` (and optionally `OPENAI_IMAGE_MODEL`) in the function environment.
