# Chatty

A messaging app (Zalo/Telegram-style: 1-1 and group chat, realtime delivery) built from scratch to learn how a production-grade chat system is put together.

## Read first

| Document | What it answers |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | The conventions block — button/icon/alias/filename decisions, and the checklists |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the pieces fit together and why |
| [docs/conventions/](docs/conventions/) | The rules for writing frontend, backend, and commits |
| [docs/adr/](docs/adr/) | Why each major technical decision was made |

## Stack

- **Server**: Node.js, Express, TypeScript, Prisma (PostgreSQL), Socket.io, Zod
- **Web**: React 18, Vite, TypeScript, Tailwind CSS v4, react-router
- **Shared**: a `packages/shared-types` workspace so server and web agree on API/event shapes at compile time

## Getting started

Requires **Node 22 or newer** (jsdom 30, used by the web tests, declares `>=22.22.2`). On Node 20 the
web suite does not fail a test — it fails to start, with an error from deep inside undici that looks
nothing like a version problem.

```bash
npm install
cp .env.example apps/server/.env

npm run db:up           # starts Postgres in Docker
npm run dev:server      # API + WebSocket server on :4000
npm run dev:web         # React app on :5173 (separate terminal)
```

Then seed some accounts to sign in with:

```bash
npm run db:seed --workspace apps/server
```

That creates `minh@test.com`, `an@test.com` and `binh@test.com` (password `SuperSecret123` for all),
one direct conversation and one group. It **wipes the database first** and refuses to run against
anything that is not localhost.

## Checks

```bash
npm run verify          # all of the below, in order, failing on the first problem
```

Or individually:

```bash
npm run typecheck       # all workspaces
npm run lint
npm run format:check    # prettier; skips docs and .prisma, see .prettierignore
npm run test            # server (Vitest + Postgres) and web (Vitest + Testing Library)
npm run audit:rules     # greps apps/web/src against the conventions — a report
npm run format          # rewrites, rather than just reporting
```

`verify` runs the audit with `--gate`, so a hit fails the command. On its own `audit:rules` stays a
report and always exits 0 — a heuristic that blocks work is a heuristic people learn to skip.

## Project layout

```
apps/
  server/         API + WebSocket backend (layered: routes -> controller -> service)
  web/            React frontend (feature-based: features/<name>/...)
packages/
  shared-types/   Types that cross the wire between server and web
docs/
  ARCHITECTURE.md How the pieces fit together
  conventions/    How to write code here
  adr/            Architecture Decision Records
scripts/
  audit-rules.sh  Convention checker (from evondev's Dev Rules, MIT)
```

## Status

Working end to end: register, sign in, find people by `@handle`, start a direct chat or a group,
send messages that arrive in real time over WebSocket, scroll up to load older history, upload an
avatar, see unread badges, read receipts, typing indicators and who is online, manage a group —
add or remove a member, rename it, leave it — and edit your own profile or change your password.

Verified by 123 server tests (against a real Postgres) and 71 web tests, plus typecheck, lint, the
conventions audit, a production build, and an end-to-end run of two live socket clients against the
running API.

**[docs/ROADMAP.md](docs/ROADMAP.md) is the current source of truth for what is done and what is
next.** Phases 1 and 2 are complete; phase 3 is in progress — group management, profile editing and
password change are done, and password reset is next.

Largest known gaps:

- **Rate-limit counters are per process.** Correct for one server, wrong for two — each keeps its own
  tally. A shared store (Redis) is a prerequisite for running more than one instance.
- **Presence and unread counts assume one process too.** Presence asks the Socket.io adapter who is
  connected, which only sees this instance until a Redis adapter is added.
- No attachments, no message edit/delete, no message search.
- **No admin role for groups** — any participant can add, remove, or rename. See
  [ADR 0006](docs/adr/0006-flat-group-permissions.md).
- **Changing a password does not sign other sessions out.** Nothing revokes a JWT, so a session
  opened before the change keeps working until the token expires — up to 7 days. Enough for "I want a
  better password", not enough for "someone else has my account".
- No password reset, and no way to change the email address — both need outbound email.
- No deployment setup (Dockerfile, CI).
