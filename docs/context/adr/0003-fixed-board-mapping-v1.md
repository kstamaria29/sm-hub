# ADR 0003: Fixed Board Mapping for v1

- Status: Accepted
- Date: 2026-02-14

## Context

Multiple mappings increase balancing, QA, and skin alignment complexity.

## Decision

Adopt a single classic mapping (`classic_v1`) for all v1 games and skins.

## Consequences

- Simplifies server validation and deterministic replay.
- Enables skin changes without gameplay logic changes.
- Limits variation until a future version introduces selectable mappings.
