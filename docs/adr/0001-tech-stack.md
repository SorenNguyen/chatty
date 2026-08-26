# ADR 0001: Initial tech stack

## Status

Accepted

## Context

Building a Zalo/Telegram-style chat app (1-1 + group messaging, realtime delivery) as a learning project, with an existing background in JavaScript/TypeScript, React, and Node.js.

## Decision

- **Backend framework: Express**, not Fastify/NestJS. Express is what's already known; the layering convention in ARCHITECTURE.md gives structure without needing a framework (like Nest) to enforce it.
- **Realtime: Socket.io**, not raw `ws`. It handles reconnection, fallback transports, and room/broadcast semantics (useful for group chat) out of the box — not worth reimplementing for a first build.
- **Database: PostgreSQL via Prisma**, not MongoDB. Messages/conversations/participants are relational by nature (a message belongs to a conversation belongs to participants); a relational DB with real foreign keys catches modeling mistakes early. Prisma gives generated TypeScript types from the schema, which pairs well with `packages/shared-types`.
- **Frontend: React + Vite**, not Next.js. There's no need for SSR/routing-on-the-server for a chat app that's mostly a single authenticated view; Vite's dev server is simpler to reason about while learning.
- **Monorepo tooling: plain npm workspaces**, not Turborepo/Nx. Two apps and one shared package don't need a build-caching/task-orchestration layer yet. Revisit if build times or task graphs become a real problem.

## Consequences

- No built-in dependency injection (unlike Nest) — services are plain functions/classes wired together manually. Acceptable at this size; revisit if the module count grows large enough that manual wiring becomes painful.
- Prisma requires a running Postgres instance even for local dev (`docker-compose.yml` provides one) — there's no in-memory fallback.
- Choosing Express/React over more "batteries-included" alternatives means more of the conventions in ARCHITECTURE.md have to be enforced by hand (code review, not framework structure) — this is deliberate, since the point of this project is to learn the *why* behind each layer, not to inherit someone else's opinions.
