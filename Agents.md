# AGENTS.md - SM Games / Family Hub (v1)

## Product snapshot

We are building a private, admin-managed family app (8-10 members, ages 30-65) focused on:

- Email/password onboarding
- Admin-provisioned members (admin enters member email, system generates temporary password)
- Family chat (real-time)
- Snakes & Ladders (turn-based, authoritative state)
- Word Master (Scrabble-like, turn-based, authoritative state)
- Cartoon avatar packs (transparent PNG) used as game tokens

Current implementation snapshot:

- Onboarding supports email/password `Create Account` + `Sign In`, then `Create Family`.
- Family creation runs through Edge Function `family-bootstrap`.
- Admin member creation runs through Edge Function `family-member-create` and returns temporary credentials.
- Chat room is functional with realtime message timeline + reactions.
- Games screen supports a game hub with selections:
  - Snakes & Ladders (authoritative start/roll/end; board grid rendering, event banners, expression-aware tokens)
  - Word Master (authoritative start/play/pass/end; board + rack + scoring)
- Settings/Profile supports:
  - display name updates
  - cinematics toggle
  - original profile photo upload from library or camera
  - navigation into Avatars flow
- Avatars flow is two-step:
  - step 1 generate/regenerate neutral preview from original photo
  - step 2 confirm neutral and generate remaining expressions (`happy`, `angry`, `crying`) sequentially
- Avatar preview grid is implemented and shows per-expression status.
- Temporary testing mode is enabled: one-player game start is currently allowed.

Out of scope for v1:

- Photo sharing / albums
- Public discovery, video calling, leaderboards, advanced moderation

## Non-negotiables

- Privacy-first: all data is scoped to a single family space; no public profiles.
- Server-authoritative game moves (no client-side "trust me" moves).
- Simple UX: big buttons, clear turn indicator, low friction for mixed tech comfort.
- Portrait + landscape support for the board screen.
- Each user picks their own avatar style; avatars are transparent PNGs.

## UI design rules

- Prefer shared UI primitives and theme tokens over one-off styling in screens.

## Documentation + MCP usage rules (MANDATORY)

- Use **Context7 MCP** for framework/library documentation (Expo/React Native ecosystem included).
- Use **OpenAI Developer Docs MCP** for OpenAI/Codex/MCP topics.

## Tech stack (v1) - DO NOT CHANGE without an ADR

### Client

- React Native (Expo)
- TypeScript
- React Navigation (tabs: Chat, Games, Settings/Profile)

### Backend

- Supabase
  - Auth (email/password)
  - Postgres (source of truth)
  - Row Level Security (RLS) for family-only data access
  - Realtime (chat + game room state updates)
  - Edge Functions (server-authoritative actions: family bootstrap, member provisioning, game start, roll/move, game end, avatar generation orchestration)
  - Storage (avatar originals optional; cartoon avatar pack PNGs required)

### OpenAI

- OpenAI Image Generation (server-side only) to generate transparent PNG cartoon avatar packs:
  - neutral, happy, angry, crying
  - 8 selectable styles per user
- All OpenAI calls must be made from Edge Functions (never from the mobile client).

### Game assets

- Snakes & Ladders board skins are pre-generated image assets:
  - `board_base` (square)
  - `overlay_snakes_ladders` (transparent)
  - `thumbnail`
- One fixed classic mapping for v1.

### Guardrails

- No direct-to-DB writes from the client for authoritative game actions.
  - Client may write chat messages and non-sensitive profile fields if allowed by RLS.
  - Client may write chat reactions if allowed by RLS.
  - Dice rolls / moves must go through an Edge Function.
- If a stack/tool choice changes, add/update an ADR under `docs/context/adr/`.

## Database and storage workflow (Supabase)

### Source of truth for DB behavior

- `supabase/migrations/*.sql`
- `supabase/README.md`
- `supabase/storage/*.sql` (bucket policies and helpers)

### When changing Supabase behavior

1. Add a new numbered migration in `supabase/migrations`.
2. Include schema/constraints/indexes/RLS updates needed for that change.
3. Keep policies aligned with **admin vs member** permissions (family app).
4. Update `supabase/README.md` if setup or verification steps change.

### Storage rules (avatars)

Buckets:

- `avatar-originals` (required for avatar generation flow)
- `avatar-packs` (required; transparent PNG pack outputs)

Avatar pack paths (REQUIRED):

- `avatar-packs/<family_id>/<user_id>/<style_id>/<version>/neutral.png`
- `avatar-packs/<family_id>/<user_id>/<style_id>/<version>/happy.png`
- `avatar-packs/<family_id>/<user_id>/<style_id>/<version>/angry.png`
- `avatar-packs/<family_id>/<user_id>/<style_id>/<version>/crying.png`

Avatar originals path (OPTIONAL):

- `avatar-originals/<family_id>/<user_id>/original.<ext>`

Access rules (avatars)

- Read: authenticated users who are members of the same family
- Write/replace:
  - avatar-originals: the user themself (admin access may be policy-enabled)
  - avatar-packs: **Edge Functions only** (server-generated). Direct client writes are not allowed.

## Animations (v1) - REQUIRED

### Animation libraries

- Use **react-native-reanimated** for game/token/UI animations.
- use **lottie-react-native** for a polished dice-roll animation (if assets available).
- Do not introduce additional animation frameworks without an ADR.

### Animation rules

- Default movement is **fast tile hops** (tile-by-tile).
- Only do **zoomed-in cinematic moments** for:
  - Dice roll animation
  - Snake transitions
  - Ladder transitions
- Add a Settings toggle: **Cinematics: On/Off**
  - OFF: keep animations, but disable board zoom/pan/camera effects.
  - ON: enable the limited cinematics described above.
- Animations must be driven by server-confirmed outcomes (deterministic replay).

## How to work in this repo (agent workflow)

1. **Plan first**, then implement.
   - Start every task with: Goals -> Constraints -> Files to touch -> Test plan.
2. Prefer **small, reviewable changes**.
   - Keep PRs focused; avoid drive-by refactors unless asked.
3. Before edits, **locate the relevant context** (see "Context Registry" below).
4. After edits:
   - Run the fastest relevant checks (lint/unit) and report results.
   - If tests are not configured, state what you would run and why.

## Architecture principles (v1)

- "Rooms" are the organizing unit: family chat room + game rooms.
- Snakes & Ladders:
  - Fixed classic mapping for v1 (see context docs)
  - Backend validates: membership, turn order, single roll per turn, atomic updates
  - Clients render state + animations only

## Avatar pack requirements

Avatar setup flow:
Upload/take photo -> Choose preset style or enter custom style -> Generate neutral preview -> Confirm neutral -> Generate happy/angry/crying -> Preview pack

Generation outputs:

- 4 transparent PNGs: neutral, happy, angry, crying
- Consistent crop/scale across all 4
- Store as an "Avatar Pack" with an active version per user

Current implementation note:

- Expression generation after neutral currently runs one expression per request to reduce function compute pressure.
- Users can regenerate `happy`, `angry`, and `crying` individually after neutral is ready.

In-game expressions:

- Ladder -> happy (~2s)
- Snake -> angry (~2s)
- Big snake drop (>=20 tiles) -> crying (~2s)
- Win -> winner happy; others crying (~2-3s)
- Otherwise neutral

## Board skins (v1)

Skins: Tropical, Space, Family

- One fixed mapping -> skins are image assets aligned to a master template.
- Prefer: board_base (square), overlay_snakes_ladders (transparent), thumbnail.
- Do not bake tile numbers into skins unless explicitly requested; numbers should remain readable.

## Context Registry (READ THIS FIRST)

All project reference docs live under: `docs/context/`.
Start at: `docs/context/INDEX.md`

When you need product rules, mappings, UI specs, or decisions:

- Use the Index to find the right file.
- Only load the minimum needed to complete the task.

## Repo hygiene

- Keep docs updated when you add/move significant files:
  - update `docs/context/INDEX.md`
  - add/adjust ADRs in `docs/context/adr/`
- Prefer clear names and short docs over huge "mega files".

## At the end of every task

- Suggest one Conventional Commit message in this format:
  - `git commit -m "type: message"`
- Provide quick verification steps.

Every task response must end with:

**Verification:**

- ...

## Immediate next steps (v1)

1. Re-enable minimum two-player requirement when multiplayer testing is complete (replace temporary one-player mode).
2. Add explicit avatar approval/activation UX after full pack generation.
3. Improve avatar generation reliability (retry/backoff + clearer progress/error states).
4. Add automated tests for critical RPCs (`start_game_v1`, `roll_game_turn_v1`, `end_game_v1`, avatar reserve/generate flow).
5. Add deployment runbook checks for function secrets and migration drift.
