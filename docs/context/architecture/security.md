# Security Model and RLS Intent (v1)

## Role Model

- `admin`: full family management permissions
- `member`: normal participant permissions

## Family-Only Access

- Authenticated users may only read rows where they belong to the same `family_id`.
- Cross-family reads/writes are denied by default.

## RLS Intent by Domain

- Family and membership tables: admins manage membership; members can read own family records.
- Invites table remains legacy-only and is not used in the app flow.
- Chat (`rooms`, `messages`): members can read/write inside their family rooms.
- Games (`games`, `game_players`, `game_events`): members read; authoritative writes happen through Edge Functions.
- Avatar metadata (`user_profiles`, `avatar_packs`): members manage own profile; family members can read avatar pack metadata needed for rendering.

## Storage Intent

- `avatar-packs` bucket: family-scoped read; write only from server-side function/service role.
- `avatar-originals` bucket: optional; user can manage own original, admin may have delegated access.
