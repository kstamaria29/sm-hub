# PRD - Family Hub v1

## Goal

Deliver a private, invite-only family app for 8-10 members with onboarding, real-time chat, Snakes & Ladders, and avatar packs.

## In Scope (v1)

- Invite-only onboarding with Supabase Auth (email OTP or phone OTP)
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

- A user can join a family only by invite.
- Family members can send and receive chat messages in real time.
- Game actions are validated and applied on the backend only.
- Each user can select an avatar style and use generated PNG expressions in game.
