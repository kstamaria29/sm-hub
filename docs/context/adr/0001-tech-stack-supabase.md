# ADR 0001: Expo + Supabase for v1

- Status: Accepted
- Date: 2026-02-14

## Context

v1 needs fast delivery of auth, realtime chat, authoritative game state, and storage for avatar packs with strict privacy boundaries.

## Decision

Use Expo React Native (TypeScript) on client and Supabase (Auth, Postgres, RLS, Realtime, Storage, Edge Functions) on backend.

## Consequences

- Faster v1 delivery with managed backend primitives.
- RLS becomes central security control and must be tested carefully.
- Edge Functions become required for privileged game and avatar generation operations.
