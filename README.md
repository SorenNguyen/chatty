# Chatty

A messaging app (Zalo/Telegram-style: 1-1 and group chat, realtime delivery) built from scratch to learn how a production-grade chat system is put together.

## Read first

| Document | What it answers |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | The conventions block — button/icon/alias/filename decisions, and the checklists |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to run it, what the gate is, and what a good pull request looks like |
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

Mail is **not** optional: `MAIL_TRANSPORT` has no default and the server will not boot without it.
`.env.example` points at Mailpit, which is the recommended way to work —

```bash
docker compose up -d mailpit     # SMTP on :1025, web inbox on http://localhost:8025
```

— so a password reset link arrives as an email you open, rather than a line you grep for. Setting
`MAIL_TRANSPORT=console` instead logs the message and is refused outright when `NODE_ENV=production`.

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
log, hand it to somebody else — edit your own profile, change your password, or reset a forgotten
one, move the account to a new email address, turn read receipts off, delete the account entirely,
send an image with or without a caption, rewrite or delete a message you sent, and search every
conversation you are in for a message you half remember.

Deleting leaves a marked-out placeholder rather than a hole: the text is emptied and the image and its
file are removed, but the row stays so that other people's read markers and the paging cursor still
have something to point at. See [docs/ROADMAP.md](docs/ROADMAP.md) phase 8.

A group has an owner: the person who created it. Only they can rename it, remove somebody else or
hand the group on; anyone can invite, and anyone can leave. See
[ADR 0008](docs/adr/0008-group-owner-role.md).

Deleting your account removes the account, its avatar file and every session it had open — but not
its messages. Those stay in their conversations with the author taken off them, rendered as "Deleted
account", for the same reason a deleted message leaves a tombstone: other people's read markers and
the paging cursor still point at those rows. Read receipts can be turned off, and the setting is
symmetric — hide yours and you stop seeing everyone else's, with nothing revealed retroactively when
you turn them back on. See [docs/ROADMAP.md](docs/ROADMAP.md) phase 13.

Verified by 307 server tests (against a real Postgres), 146 web tests, and 14 Playwright specs
driving a real browser against a real server — plus typecheck, lint, the conventions audit, and a
production image build. CI runs all of it except the browser suite on every push.

**[docs/ROADMAP.md](docs/ROADMAP.md) is the current source of truth for what is done and what is
next.** Phases 1 to 13 are complete. Phase 7 makes group and password-reset transitions safe under
concurrent requests: one conversation lock orders membership-sensitive writes, PostgreSQL enforces
the owner/message invariants, and fault-injection tests prove partial writes do not escape. Phase 8
adds editing and deleting your own messages, on the same lock, with the deletion kept as a tombstone
so that read markers and paging cursors still have a row to point at. Phase 9 makes outbound mail
durable: it is queued in the same transaction as the thing that promised it, and a worker retries
with backoff, claiming rows in a way that is safe to run on every instance — see
[ADR 0011](docs/adr/0011-transactional-outbox-for-mail.md). Phase 10 gave it a real SMTP transport,
so a reset link now leaves the process and lands in an inbox; the configuration has no silent
fallback, and five ways of getting it wrong stop the server booting rather than degrading to a log
file. Phase 11 makes a misconfigured production refuse to start at all and proves the two-instance
path for the first time; phase 12 adds full-text search. Phase 13 is what an account needs before
real people have one — changing its email address, handing a group on, hiding read receipts, and
deleting the account — and it is where `Message.authorId` stopped cascading, so somebody can leave
without taking half of everyone else's conversations with them.

Largest known gaps:

- **No real deployment yet, and it is blocked on purchases rather than code** — a domain, a host and
  an SMTP account. The cost of each, the two host options and what changes between them are worked
  out in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- **Search does not ignore diacritics.** Finding a message works (phase 12), but `hen gap` does not
  match `hẹn gặp` — closing that needs the `unaccent` extension, which is a dependency not worth
  taking on before the host is chosen. The phase 12 migration spells out the exact change.
- **No edit history and no time limit on editing** — a message can be rewritten years later and the
  only trace is the word "edited". Deleting is for everybody, never just for you.
- **There is no second admin and no demotion** — the role is one seat, so nobody can cover for an
  owner who has gone quiet without them handing it over first — and any member can still invite a
  stranger. See [ADR 0008](docs/adr/0008-group-owner-role.md).
- **A system line does not follow a later rename** — "An added Binh" keeps the names people had when
  it happened, by design. See [ADR 0009](docs/adr/0009-system-messages.md).
- **Mail sends, but no production account is signed up for.** Phase 10 added a real SMTP transport
  and development runs against Mailpit; a deployment still needs a provider, a verified sending
  domain and SPF/DKIM/DMARC records, without which mail is accepted and then filed as spam. Delivery
  is at-least-once — `Message-ID` makes a retry recognisable, nothing more — and bounces are
  invisible, because the outbox records that the server *accepted* the message rather than that it
  arrived. Changing an account's email address (phase 13) runs on the same machinery and inherits the
  same limits.
- **An attachment URL works for anyone holding it, until it expires.** Signed and scoped to one image
  with a one-hour life, but bearer proof for that hour — see
  [ADR 0007](docs/adr/0007-signed-attachment-urls.md). One image per message; no lightbox and no upload
  progress. Deleting a message now removes its file, but a send that fails midway — or a crash between
  the delete committing and the unlink — still leaves one nothing references. Deleting an account does
  not help here: the messages survive it, so their attachments are still referenced.
- **Still no TLS, reverse proxy, load balancer or object storage.** The two API instances sit on
  separate ports rather than behind anything, and uploads are a shared volume — which works on one
  machine and does not survive per-machine disks. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- **The web app has no Content-Security-Policy.** The API's headers are set (phase 11); the static
  server's are not, and a CSP added without a browser exercising it is a CSP that breaks the first
  image.
- Playwright covers one browser, and `test:e2e` is not part of `verify` — it needs two servers and a
  browser download.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). The **Known gaps**
list above is the real queue, and the most valuable report this repository can receive is a place
where the docs and the code say different things.

## License

[MIT](LICENSE). `scripts/audit-rules.sh` is adapted from evondev's Dev Rules, also MIT.
