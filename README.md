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

The server test setup creates its disposable `chatty_test` database automatically on the local
Postgres instance. A fresh clone therefore needs no database command between `db:up` and `verify`.

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
send an image with or without a caption, rewrite or retract a recent message, inspect its edit
history, remove any message from your own view, and search inside the open conversation for a message
you half remember. Last-seen timestamps follow the privacy choice in account settings, which open as a dialog over the
chat rather than replacing it.

Deleting leaves a marked-out placeholder rather than a hole: the text is emptied and the image and its
file are removed, but the row stays so that other people's read markers and the paging cursor still
have something to point at. See [docs/ROADMAP.md](docs/ROADMAP.md) phase 8.

An author may edit or delete for everyone for eight hours after sending. The actions disappear when
that window closes; deleting only from your own view remains available without a time limit and also
removes the message from your sidebar preview, search results and unread count.

A group has an owner: the person who created it. Only they can rename it, remove somebody else or
hand the group on; anyone can invite, and anyone can leave. See
[ADR 0008](docs/adr/0008-group-owner-role.md).

Deleting your account removes the account, its avatar file and every session it had open — but not
its messages. Those stay in their conversations with the author taken off them, rendered as "Deleted
account", for the same reason a deleted message leaves a tombstone: other people's read markers and
the paging cursor still point at those rows. Read receipts can be turned off, and the setting is
symmetric — hide yours and you stop seeing everyone else's, with nothing revealed retroactively when
you turn them back on. See [docs/ROADMAP.md](docs/ROADMAP.md) phase 13.

Verified by 410 server tests (against a real Postgres), 266 web tests, and 30 Playwright specs
driving a real browser against a real server — plus typecheck, lint, the conventions audit, and a
production image build. CI runs all of it except the browser suite on every push.

**[docs/ROADMAP.md](docs/ROADMAP.md) is the current source of truth for what is done and what is
next.** Phases 1 to 30 are complete. Phase 7 makes group and password-reset transitions safe under
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
without taking half of everyone else's conversations with them. Phase 14 closed the four Known gaps
that were defects rather than missing features: unread now starts when you joined a group, a second
test run refuses rather than corrupting the first, the web app has a Content-Security-Policy, and
attachment files left by a failed upload are swept. Phase 16 gives the app one declared look instead
of the framework's defaults — ink on ivory paper, one signal colour, everything a machine produced set
in mono, self-hosted fonts so the Content-Security-Policy stays as strict as phase 14 left it — and
moves account settings into a dialog over the chat, so changing your display name no longer costs you
the conversation you were reading. `/profile` still deep-links to it and Back still closes it. Phase 17
is the geometry inside that look: a run of messages from one person is now one shape with one tail
rather than five bubbles each claiming their own, every timestamp moved off its own line into the
gutter beside the bubble, and the type changed to Geist and Geist Mono — one superfamily, and the
first pair in this app to ship a Vietnamese subset, so a name with diacritics no longer falls out of
the font mid-word. It also adds the two things a message could not do: **reactions** (reworked in phase 29 — see below)
and **replies** (a self-relation, so an edited
original re-quotes itself, a deleted one quotes as a tombstone, and an image reply keeps a small
thumbnail). Message bursts now break after a real pause rather than sticking together for hours, and
the mobile layout is a deliberate conversation-list → thread → back flow instead of a squeezed
two-column desktop shell.

Phases 18-21 are about the difference between working and being trusted. Phase 18 fixes three ways
the screen quietly stopped telling the truth: a dropped socket now resyncs the sidebar and the thread
when it comes back instead of leaving both silently stale, an expired session says so and returns you
to the login form instead of failing every request separately, and a thread that could not load shows
the reason and a retry rather than rendering as an empty conversation. Phase 19 closes the
perceived-quality gap — a text message appears the instant you press Enter and is marked "Not sent"
with a retry if it does not arrive, the unread count is in the tab title, browser notifications are
available per-browser, and removing somebody from a group or leaving one now asks first. Phase 20
makes search work the way Vietnamese is actually typed: `hen gap` finds `hẹn gặp`. Phase 21 makes
signing out mean something — the session is now a revocable row rather than a seven-day JWT nothing
could take back, access tokens last fifteen minutes, and a refresh rotates so a stolen one works at
most once. Phase 22 lets a message carry up to ten images — a gallery in the bubble, a viewer that
walks the set with the arrow keys — and gives the composer an emoji picker, searchable in English and
in unaccented Vietnamese. A message that is nothing but one to three emoji is drawn large with no
bubble at all. Phase 23 replaced that gallery with a stacked album — a 2×2 grid took 320×320 of the
conversation for a set that gets opened in a viewer anyway — and added **stickers**: a personal tray
of saved images, one tap from every conversation, copied into the message when sent so clearing the
tray never blanks a picture out of somebody else's chat.

Phases 24–28 complete the everyday messaging surface: arbitrary files are served as safe downloads,
voice is normalized to AAC/MP4 with a shared waveform, and each conversation has a paged vault for
media, files, voice, links and saved messages. Archive, pin and mute are per participant and sync only
to that person's devices; the sidebar patches socket events in place. Drafts survive navigation on
the local device, and the thread adds unread navigation, drag/paste, links, forwarding, mentions,
message pins, reply jumps, keyboard shortcuts, sidebar typing and group seen-by avatars.

Phase 29 is about the distance between correct and familiar. **Reactions are any emoji rather than a
closed set of five** — the closed set had been defended twice on the grounds that an ink mark keeps
colour off the page, and the app had never actually implemented that argument: the chips rendered
colour emoji while only the picker stayed in ink, so one reaction had three appearances and none of
them predicted the others. A hover bar offers the familiar six with `+` for the rest, a double-click
leaves ❤️, the chips straddle the bubble's bottom edge the way Messenger and Instagram draw them, and
one person gets one reaction per message — picking a second replaces the first, which the primary key
now enforces. What made the set closed is preserved where it belongs: the request boundary accepts a
single fully-qualified RGI emoji and nothing else, so `❤` and `❤️` cannot both reach the column and
split one reaction into two chips. **Who reacted is a panel** rather than a `title` attribute that no
touch screen could ever reach. **There is a Light / Dark / System setting**, resolved before the first
paint by a `<head>` script that is a file rather than an inline one, because the Content-Security-Policy
sets `script-src 'self'` and is worth more than a theme. Pictures now send optimistically — decoded
first, so the bubble reserves exactly the box the stored image will occupy — and the thread stops
accumulating history it is not showing, which is item 76 answered by bounding the array rather than by
windowing it.

Largest known gaps:

- **No real deployment yet, and it is blocked on purchases rather than code** — a domain, a host and
  an SMTP account. The cost of each, the two host options and what changes between them are worked
  out in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
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
- **An attachment URL works for anyone holding it, until it expires.** Signed and scoped to one attachment
  with a one-hour life, but bearer proof for that hour — see
  [ADR 0007](docs/adr/0007-signed-attachment-urls.md). Files left behind by a send that failed midway
  are swept every six hours as of phase 14; avatar files are not swept yet.
- **Still no TLS, reverse proxy, load balancer or object storage.** The two API instances sit on
  separate ports rather than behind anything, and uploads are a shared volume — which works on one
  machine and does not survive per-machine disks. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- **The CSP is not verified against a live API.** The web app has one as of phase 14, checked in a
  real browser against the built image — but with no API behind it, so `img-src` and `connect-src`
  are argued from the header's contents rather than demonstrated end to end.
- **The conversation list is not paginated.** Phase 27 removed the blocker by replacing per-message
  full re-lists with incremental socket patches; a cursor is now an independent follow-up.
- **The message list is not virtualised.** Messages accumulate only through explicit paging, so
  reaching a DOM large enough to matter takes deliberate work — but the ceiling is real, and the two
  cheap fixes both risk the scroll-position handling that already works. See phase 19, item 76.
- Playwright covers one browser, and `test:e2e` is not part of `verify` — it needs two servers and a
  browser download.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). The **Known gaps**
list above is the real queue, and the most valuable report this repository can receive is a place
where the docs and the code say different things.

## License

[MIT](LICENSE). `scripts/audit-rules.sh` is adapted from evondev's Dev Rules, also MIT.
