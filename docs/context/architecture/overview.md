# Architecture Overview (v1)

## Client (Expo React Native)

- Tabs: Chat, Games, Settings/Profile
- Renders realtime chat and game state from Supabase
- Sends authoritative game actions to Edge Functions only

## Backend (Supabase)

- Auth: invite-only sign-in (email OTP or phone OTP)
- Postgres: source of truth for family, chat, game, and avatar metadata
- Realtime: room messages and game state subscriptions
- Storage: avatar-originals (optional) and avatar-packs (required)

## Edge Functions

- `family-bootstrap`: creates family, owner membership, and default rooms atomically
- `invite-accept`: validates invite token and joins member atomically
- `game-roll-move`: validates turn order and applies authoritative move transaction
- `avatar-generate-pack`: orchestrates server-side avatar pack generation and storage

## Security Model

- RLS enforces family-only access.
- Role distinctions: owner/admin vs member.
- Service role is used for backend-only privileged operations.
