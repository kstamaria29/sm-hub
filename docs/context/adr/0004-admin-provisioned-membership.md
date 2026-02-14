# ADR 0004: Admin-Provisioned Membership and Email/Password Auth

- Status: Accepted
- Date: 2026-02-14

## Context

The product direction changed from invite-based onboarding to admin-managed family membership. We need simpler sign-in (email/password) and explicit admin control for adding members.

## Decision

- Use email/password auth for client onboarding.
- Keep family roles to `admin` and `member` in active flows.
- Remove invite-join flow from the app.
- Add admin provisioning flow:
  - Admin enters member email
  - Backend creates auth user
  - Backend generates and returns temporary password
  - Backend inserts/updates family membership and profile atomically

## Consequences

- Faster onboarding for private family setup without invite token handling.
- Admin carries responsibility for secure credential sharing.
- Existing invite table remains legacy data but is not used in app UX.
