# Edge Functions (Scaffold)

- `family-bootstrap`: atomically creates family + admin membership + default rooms
- `family-member-create`: admin creates member auth account + family membership with memorable temporary password (word + 2 digits) and marks first-login password reset required
- `family-member-delete`: admin deletes a member account and cleans related data (membership/profile/messages/game refs + avatar storage files)
- `game-start`: admin starts a new authoritative Snakes & Ladders session in the family game room
- `game-roll-move`: authoritative Snakes & Ladders turn executor
- `game-end`: admin ends/cancels the current authoritative game session
- `word-master-start`: admin starts a new authoritative Word Master session
- `word-master-play`: authoritative Word Master turn executor (tile placements)
- `word-master-pass`: authoritative Word Master pass executor
- `word-master-end`: admin ends/cancels the current authoritative Word Master session
- Word Master dictionary validation uses an offline ispell dictionary when available; otherwise seed `public.word_master_dictionary_words`.
- `cue-clash-start`: admin starts a new authoritative Cue Clash (8-ball pool) session
- `cue-clash-shot`: authoritative Cue Clash shot executor (physics simulation + rules)
- `cue-clash-end`: admin ends/cancels the current authoritative Cue Clash session
- `avatar-generate-pack`: server-side avatar pack generation orchestrator (neutral-first supported; uses uploaded original profile image as reference)

All functions validate bearer auth and call transactional server logic via service-role RPC.

`avatar-generate-pack` also requires `OPENAI_API_KEY` in the function environment.
Optional generation tuning env vars:
- `OPENAI_IMAGE_MODEL` (default: `gpt-image-1.5`)
- `OPENAI_IMAGE_QUALITY` (global override: `low|medium|high`)
- `OPENAI_IMAGE_QUALITY_NEUTRAL` (default when no global override: `high`)
- `OPENAI_IMAGE_QUALITY_EXPRESSIONS` (default when no global override: `high`)
For the two-step avatar flow, client calls can request only `neutral` first, then request `happy`/`angry`/`crying` after user confirmation.
For non-neutral variants, generation uses the confirmed `neutral.png` as the sole reference image so expression variants stay aligned to the same base avatar.
