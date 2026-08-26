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

Redis is optional in development and the server starts without it. Set `REDIS_URL` (and
`docker compose up -d redis`) only to exercise the multi-instance path — see
[docs/ROADMAP.md](docs/ROADMAP.md) phase 5 item 12.

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

End-to-end tests are separate, because they need both servers and a browser:

```bash
npm run e2e:install     # once — downloads chromium
npm run test:e2e        # starts the API and web on :4100/:5273 against chatty_e2e
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
e2e/              Playwright specs — a real browser against a real server
scripts/
  audit-rules.sh  Convention checker (from evondev's Dev Rules, MIT)
```

Deployment lives in `apps/*/Dockerfile`, `docker-compose.prod.yml` (two API instances, on purpose)
and `.github/workflows/verify.yml`.

## Status

Working end to end: register, sign in, find people by `@handle`, start a direct chat or a group,
send messages that arrive in real time over WebSocket, scroll up to load older history, upload an
avatar, see unread badges, read receipts, typing indicators and who is online, manage a group —
invite someone, rename it, remove a member, leave it, with every one of those announced in the chat
log — edit your own profile, change your password, or reset a forgotten one, and send an image with
or without a caption.

A group has an owner: the person who created it. Only they can rename it or remove somebody else;
anyone can invite, and anyone can leave. See [ADR 0008](docs/adr/0008-group-owner-role.md).

Verified by 204 server tests (against a real Postgres), 111 web tests, and 11 Playwright specs
driving a real browser against a real server — plus typecheck, lint, the conventions audit, and a
production image build. CI runs all of it except the browser suite on every push.

**[docs/ROADMAP.md](docs/ROADMAP.md) is the current source of truth for what is done and what is
next.** Phases 1 to 7 are complete. Phase 7 makes group and password-reset transitions safe under
concurrent requests: one conversation lock orders membership-sensitive writes, PostgreSQL enforces
the owner/message invariants, and fault-injection tests prove partial writes do not escape. Password
reset is complete at repository level: the flow, tokens and session invalidation are real, while the
development mailer logs the link. Production delivery still needs a provider plus the durable
outbox/worker described under Known gaps.

Largest known gaps:

- **Running more than one instance requires `REDIS_URL`, and nothing enforces it.** With it, rate-limit
  counters and Socket.io rooms are shared and two instances behave as one system; without it both
  fall back to process memory and a second instance silently keeps its own tally and loses messages
  broadcast by the first. `docker-compose.prod.yml` always sets it and the server warns loudly in
  production when it is missing, but a hand-rolled deployment can still get this wrong.
- No message edit/delete, no message search.
- **A group owner cannot hand over without leaving**, there is no second admin and no demotion, and
  any member can still invite a stranger. See [ADR 0008](docs/adr/0008-group-owner-role.md).
- **A system line does not follow a later rename** — "An added Binh" keeps the names people had when
  it happened, by design. See [ADR 0009](docs/adr/0009-system-messages.md).
- **No outbound email.** Password reset works, but the link is written to the server log rather than
  sent. Delivery is detached from the generic 204 so provider failure cannot reveal registered
  addresses; a real provider therefore also needs a durable outbox/worker with retry, not only an API
  call. Changing the email address on an account is not built at all — it needs the same machinery to
  prove the new address is reachable.
- **An attachment URL works for anyone holding it, until it expires.** Signed and scoped to one image
  with a one-hour life, but bearer proof for that hour — see
  [ADR 0007](docs/adr/0007-signed-attachment-urls.md). One image per message; no lightbox, no upload
  progress, and files are not cleaned up when a message is deleted.
- **No real deployment.** There are Dockerfiles, a two-instance compose file and CI, but no TLS, no
  reverse proxy or load balancer, no object storage (uploads are a shared volume), and no hosting.
- Playwright covers one browser, and `test:e2e` is not part of `verify` — it needs two servers and a
  browser download.
