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
- Chat reactions (`message_reactions`): members can read family reactions and write/update/delete their own reaction per message.
- Games (`games`, `game_players`, `game_events`): members read; authoritative writes happen through Edge Functions.
- Word Master (`word_master_*`): members read; authoritative writes happen through Edge Functions.
- Avatar metadata (`user_profiles`, `avatar_packs`): members manage own profile; family members can read avatar pack metadata needed for rendering.

## Function Privilege Model

- Direct execution of privileged `app.*` RPCs is denied to `public`.
- Service role executes privileged RPCs through public wrappers (for PostgREST schema resolution).
- Hardened helper functions (`app.is_family_member*`, `app.family_role_for_user*`) run with definer context to avoid recursive RLS evaluation issues.
- Edge functions are the intended caller surface for:
  - family bootstrap
  - admin member provisioning
  - game start/roll/end
  - avatar pack reservation/generation

## Storage Intent

- `avatar-packs` bucket: family-scoped read; write only from server-side function/service role.
- `avatar-originals` bucket: optional; user can manage own original, admin may have delegated access.

## Current Auth + onboarding posture

- App onboarding uses email/password only.
- Invite acceptance is not used in current UX even though legacy invite artifacts remain in schema/code.
