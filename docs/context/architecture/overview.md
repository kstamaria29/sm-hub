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
- `avatar-generate-pack`: orchestrates server-side avatar pack generation and storage (neutral-first supported)

## Security Model

- RLS enforces family-only access.
- Role distinctions: admin vs member.
- Service role is used for backend-only privileged operations.

Legacy surface:

- `invite-accept` function exists in codebase but is not part of the current app UX.
