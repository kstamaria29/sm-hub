# ADR 0002: Server-Authoritative Game Moves

- Status: Accepted
- Date: 2026-02-14

## Context

Snakes & Ladders requires trusted turn order and deterministic outcomes across clients.

## Decision

All dice roll and movement logic runs in Supabase Edge Functions with transactional DB writes. Clients only request actions and render server-confirmed results.

## Consequences

- Prevents client-side cheating and race conditions.
- Requires event logging and idempotency handling in backend logic.
- Game UX depends on reliable function latency and retries.
