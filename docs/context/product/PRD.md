# PRD - Family Hub v1

## Goal

Deliver a private, admin-managed family app for 8-10 members with onboarding, real-time chat, Snakes & Ladders, and avatar packs.

## In Scope (v1)

- Email/password onboarding with Supabase Auth
- Admin-provisioned members (admin enters member email and system generates temporary password)
- Family chat room with real-time updates
- Snakes & Ladders with server-authoritative turns and outcomes
- Avatar pack setup and selection (8 styles, 4 expressions: neutral/happy/angry/crying)

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
- Each user can select an avatar style and use generated PNG expressions in game.
