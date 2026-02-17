# Architecture Overview (v1)

## Client (Expo React Native)

- Tabs: Chat, Games, Settings/Profile
- Hidden route: Avatars (navigated from Settings/Profile)
- Renders realtime chat and game state from Supabase
- Sends authoritative family/game/avatar actions to Edge Functions only

## Backend (Supabase)

- Auth: email/password sign-in
- Postgres: source of truth for family, chat, game, and avatar metadata
- Realtime: room messages and game state subscriptions
- Storage: avatar-originals (required for avatar generation) and avatar-packs (required)

## Edge Functions

- `family-bootstrap`: creates family, admin membership, and default rooms atomically
- `family-member-create`: admin provisions auth user + family membership with temporary password
- `game-start`: validates admin caller and starts an authoritative game session
- `game-roll-move`: validates turn order and applies authoritative move transaction
- `game-end`: validates admin caller and closes an open game session
- `word-master-start`: validates admin caller and starts an authoritative Word Master session
- `word-master-play`: validates turn order and applies authoritative tile placement transaction
- `word-master-pass`: validates turn order and advances to the next player
- `word-master-end`: validates admin caller and closes an open Word Master session
- `cue-clash-start`: validates admin caller and starts an authoritative Cue Clash session
- `cue-clash-shot`: validates turn order and applies authoritative shot simulation + state update
- `cue-clash-end`: validates admin caller and closes an open Cue Clash session
- `avatar-generate-pack`: orchestrates server-side avatar pack generation and storage (neutral-first supported)

## Security Model

- RLS enforces family-only access.
- Role distinctions: admin vs member.
- Service role is used for backend-only privileged operations.
- Chat reactions are written by authenticated members under RLS (`message_reactions`).

Legacy surface:

- `invite-accept` function exists in codebase but is not part of the current app UX.
