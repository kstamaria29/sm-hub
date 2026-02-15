# PRD - Family Hub v1

## Goal

Deliver a private, admin-managed family app for 8-10 members with onboarding, real-time chat, games (Snakes & Ladders + Word Master), and avatar packs.

## In Scope (v1)

- Email/password onboarding with Supabase Auth
- Admin-provisioned members (admin enters member email and system generates temporary password)
- Family chat room with real-time updates
- Snakes & Ladders with server-authoritative turns and outcomes
- Word Master (Scrabble-like) with server-authoritative turns and outcomes
- Avatar pack setup and selection (8 styles, 4 expressions: neutral/happy/angry/crying)

## Current Implementation Notes

- Onboarding flow is email/password only and uses a family bootstrap step after auth.
- Admin provisioning is live and returns temporary credentials at creation time.
- Game lifecycle supports `start`, `roll`, and `end` actions through Edge Functions only.
- Word Master lifecycle supports `start`, `play`, `pass`, and `end` actions through Edge Functions only.
- Avatar flow is neutral-first:
  - generate neutral from original profile photo
  - confirm and generate remaining expressions
- Original profile photo can be provided from library upload or camera capture.

Temporary deviation for testing:

- One-player game start is currently allowed to unblock test cycles.
- Production rule target remains minimum two active players.

## Out of Scope (v1)

- Photo sharing and albums
- Public discovery or public profiles
- Video calling
- Leaderboards and advanced moderation

## Non-Negotiables

- Data is scoped to one family space.
- Clients do not authoritatively mutate game state.
- Board supports portrait and landscape.
- OpenAI image generation is server-side only (Supabase Edge Functions).

## v1 Acceptance Criteria

- Admin can create family members and securely share generated temporary credentials.
- Family members can sign in with email/password and access only their own family space.
- Family members can send and receive chat messages in real time.
- Game actions are validated and applied on the backend only.
- Multiple games are selectable from the Games tab hub.
- Each user can select an avatar style and use generated PNG expressions in game.
- Admin can explicitly end/cancel an open game session.
