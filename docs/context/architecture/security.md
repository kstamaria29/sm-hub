# Security Model and RLS Intent (v1)

## Role Model

- `owner`: full family management permissions
- `admin`: elevated management permissions (without owner-only actions)
- `member`: normal participant permissions

## Family-Only Access

- Authenticated users may only read rows where they belong to the same `family_id`.
- Cross-family reads/writes are denied by default.

## RLS Intent by Domain

- Family and membership tables: owner/admin manage membership; members can read own family records.
- Invites: owner/admin create/revoke; members read minimal status if needed.
- Chat (`rooms`, `messages`): members can read/write inside their family rooms.
- Games (`games`, `game_players`, `game_events`): members read; authoritative writes happen through Edge Functions.
- Avatar metadata (`user_profiles`, `avatar_packs`): members manage own profile; family members can read avatar pack metadata needed for rendering.

## Storage Intent

- `avatar-packs` bucket: family-scoped read; write only from server-side function/service role.
- `avatar-originals` bucket: optional; user can manage own original, owner/admin may have delegated access.
