# Context Index

This file is the context registry for v1. Start here before editing product, game, data, or security behavior.

## Product

- `docs/context/product/PRD.md` - v1 scope, non-goals, and acceptance criteria

## Game: Snakes & Ladders

- `docs/context/game/snakes-and-ladders/mapping-classic.md` - fixed classic mapping for v1
- `docs/context/game/snakes-and-ladders/rules.md` - turn order, exact-100, and animation policy
- `docs/context/game/snakes-and-ladders/ui-layout.md` - portrait/landscape board layout requirements
- `docs/context/game/snakes-and-ladders/skins.md` - board skin asset pack specification
- `docs/context/game/snakes-and-ladders/avatar-expressions.md` - expression trigger matrix

## Architecture

- `docs/context/architecture/overview.md` - high-level system responsibilities
- `docs/context/architecture/data-model.md` - planning-level entities and relationships
- `docs/context/architecture/security.md` - RLS intent and role permissions

## Decisions (ADR)

- `docs/context/adr/0001-tech-stack-supabase.md` - Expo + Supabase adoption
- `docs/context/adr/0002-authoritative-game-moves.md` - edge functions as authoritative move executor
- `docs/context/adr/0003-fixed-board-mapping-v1.md` - single classic mapping in v1
