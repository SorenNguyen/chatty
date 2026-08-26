# Architecture

## Overview

```
apps/web (React) ──HTTP──► apps/server (Express)
       │                          │
       └──────WebSocket──────────►│  (Socket.io)
                                   │
                                   ▼
                              PostgreSQL
```

- **HTTP (REST)** handles one-shot actions: auth, fetching conversation history, creating a conversation.
- **WebSocket** is a persistent connection used to push events the client didn't ask for: a new message arriving, a user going online, someone typing.

A client authenticates once via HTTP (gets a JWT), then uses that same JWT to open the WebSocket connection. Everything after that — actually sending/receiving messages in realtime — happens over the socket, not by polling the REST API.

**Which transport writes what.** Anything that persists goes over HTTP and comes back to everyone as a server event: sending a message, marking a conversation read. One write path is easier to secure, and it means the sender's UI renders from the same event everyone else does, so a broadcast bug cannot hide from the person testing it.

**Which writes compete.** Sending, adding/removing a participant and renaming all lock the same
`Conversation` row before they re-check authorization and write. That makes a send versus kick, or
two people leaving, one ordered history rather than two stale snapshots racing to commit. A group
state change and its system messages share one database transaction; socket effects run only after
commit. See [ADR 0010](adr/0010-serialize-conversation-writes.md).

Typing is the one exception, and it proves the rule — it is not written anywhere, it fires several times a sentence, and it expires in seconds. On HTTP it would be a request per keystroke, each with its own round trip and auth check. So `typing:start` / `typing:stop` are the only client→server socket events, and their membership check reads `socket.rooms` rather than the database for the same reason.

## Server layering (`apps/server/src`)

Each feature lives in `modules/<feature>/` with three files:

- `*.routes.ts` — wires HTTP routes to controller functions. No logic here.
- `*.controller.ts` — reads the request, calls the service, shapes the response. No business logic here either.
- `*.service.ts` — the actual business logic and database calls. This is what you unit test.

Why split it this way: a controller shouldn't know *how* something is done (that's the service's job), and a service shouldn't know it's being called from HTTP (so the same service can be reused from a socket event handler). This is the layer that will feel like overhead on a tiny feature and pay off the moment two entry points (HTTP + socket) need the same logic.

`sockets/` holds WebSocket event handlers, following the same principle: handlers stay thin and call into the same `*.service.ts` files the HTTP controllers use.

`lib/` is for cross-cutting infrastructure (the Prisma client singleton, the logger) — nothing feature-specific belongs here.

## Data model (`apps/server/prisma/schema.prisma`)

Six core tables:

- `User` — account + profile
- `Conversation` — a 1-1 or group thread (no separate "DM" vs "group" table; a 1-1 chat is just a conversation with two participants)
- `ConversationParticipant` — join table between `User` and `Conversation`, and where per-user state lives: `lastReadMessageId` is here, not on `Message`, because "read" is a fact about a person and a group of ten has ten different answers for the same message. `role` is here too: exactly one participant of a non-empty group is its `OWNER`, and only they may rename it or remove anyone else ([ADR 0008](adr/0008-group-owner-role.md)). PostgreSQL enforces this with a partial unique index and deferred aggregate trigger because Prisma cannot express a cross-row constraint ([ADR 0010](adr/0010-serialize-conversation-writes.md))
- `Message` — belongs to a `Conversation`, authored by a `User`. `content` is an empty string when the message is only an image. A `kind = SYSTEM` message is the exception with no author at all: it is the group event log ("An added Binh"), stored as a message so it survives a reload and sits in order among the messages around it ([ADR 0009](adr/0009-system-messages.md)). A database check rejects either contradictory shape (`USER` without an author or `SYSTEM` with one)
- `PasswordResetToken` — a one-time link, stored only as a SHA-256 of the token that was mailed
- `Attachment` — an image on a `Message`, one per message (a unique on `messageId`). No mime type or original filename column: every upload is re-encoded to WebP, so the type is known and constant, and the name a stranger chose is a string nothing here needs

Modeling 1-1 chat as a conversation with exactly two participants (rather than a separate table) means group chat isn't a bolt-on later — it's the same code path from day one.

Two things deliberately have **no** table:

- **Typing.** It fires several times a sentence and is worthless a few seconds later.
- **Presence.** A stored "online" flag is a lie waiting to happen — the process that would clear it is exactly the one that crashed, and every stale row then shows someone as online forever. It is derived from live socket connections instead, which cannot go stale because there is no state to forget.

## Files (`lib/avatar-storage.ts`, `lib/attachment-storage.ts`)

Two kinds of file are uploaded — avatars and message attachments — and they are deliberately separate modules rather than one shared image store. The two answer different questions: an avatar is one square per user, overwritten in place, public, cached forever; an attachment is one file per message, never replaced, private, reached through a signed URL. Merging them would produce a function whose every argument decides which of the two it is doing.

What they share is the re-encode, and the reason for it.

### Avatars

The URL for an avatar is **derived, never stored**. The database keeps `User.avatarUpdatedAt`; the server builds `{PUBLIC_URL}/users/:id/avatar?v=<timestamp>` from it.

That is the same shape Rocket.Chat and Mattermost use, and it buys two things a stored URL cannot: the version parameter changes the moment a picture does, so browsers can cache avatars indefinitely without ever showing a stale one; and no row contains a storage path, so swapping local disk for S3 is a change to `lib/avatar-storage.ts` and nothing else.

Uploads are decoded and re-encoded to WebP rather than stored as they arrived. That is a security control, not a size optimisation: a browser decides what a file is by sniffing its bytes, so anything that survives a MIME check could otherwise be served back from this origin as something other than an image. It also drops metadata, which for a photo straight off a phone is a GPS fix.

### Attachments

Same re-encode, opposite serving strategy. An attachment is private content inside a conversation, so "addressed by an id nobody can guess" — which is enough for a public profile picture — is not enough here. `AttachmentDTO.url` carries a signed token scoped to that one attachment, minted per response and expiring after an hour, and `GET /attachments/:id` is the app's second and last unauthenticated route. A bad token answers 404 rather than 401, so the endpoint never confirms that an id exists.

Both kinds of token are signed with `JWT_SECRET`, so attachment tokens carry a `typ` claim and `requireAuth` rejects any token that has one — otherwise an attachment token presented as a bearer token would authenticate as a user whose id is an attachment id.

### Password reset

Issuing a link locks the `User` row while it spends previous links and creates the replacement, so
two simultaneous requests leave only one current token. Redeeming uses a conditional claim inside
the same transaction as the password update; only one request can change a still-unused, unexpired
row.

Known and unknown addresses both receive an empty 204 after a 300ms response floor. Mail delivery is
started only after the token commits and is not awaited, because provider latency and failure exist
only on the known-account path and would otherwise reveal membership. The development console
transport is process-local. A production provider needs a durable outbox/worker so a process crash
between commit and delivery can be retried without putting delivery back on the HTTP path.

See [ADR 0007](adr/0007-signed-attachment-urls.md) for the alternatives that were rejected and what this costs.

## Running more than one instance

Two things in this app keep state outside the database, and both are per-process by default:
rate-limit counters, and the Socket.io room registry. Neither is a problem until there is a second
instance, at which point each keeps its own tally and a message broadcast by one reaches nobody
connected to the other — including presence, which asks the adapter who is connected.

Setting `REDIS_URL` moves both into Redis: `rate-limit-redis` for the counters,
`@socket.io/redis-adapter` for the rooms. Everything else is already stateless — the JWT carries the
session, uploads go to a directory both instances share, and presence is derived rather than stored,
so there is no per-process state left to reconcile.

It is optional rather than required so that `npm run verify` and a plain `npm run dev:server` need
one container instead of two. `docker-compose.prod.yml` always sets it, runs two API instances to
keep the single-instance assumptions from creeping back, and the server logs a warning at boot if it
is missing in production.

The uploads directory is the remaining shared-filesystem dependency: both instances mount one volume,
because an avatar uploaded through one has to be servable by the other. Object storage is what
replaces it, and [ADR 0004](adr/0004-avatar-storage.md) and [ADR 0007](adr/0007-signed-attachment-urls.md)
are both written so that swap touches one module each.

## Shared types (`packages/shared-types`)

Both `apps/server` and `apps/web` depend on this workspace package for the shapes that cross the wire (API request/response bodies, socket event payloads). When you change what a message looks like over the wire, you change it in one place and both sides get a compile error if they're out of sync — instead of finding out at runtime.

## Web structure (`apps/web/src`)

The frontend is organized the opposite way from the server: **by feature, not by layer**.

```
features/<name>/{pages,components,hooks,utils,constants,types}   # one feature owns its code
components/ hooks/ utils/ lib/ api/ constants/ types/ styles/    # shared across 2+ features
```

The two apps deliberately do not share a structure. The server's work is a small set of operations
applied to every resource (validate → authorize → persist), so splitting by layer keeps that pipeline
visible. The web app's work is a handful of independent user-facing surfaces, so splitting by feature
keeps each surface deletable in one folder.

The rule that keeps it honest: **never import across features.** If `chat` and `auth` both need
something, it moves up into the shared folders. See
[conventions/frontend.md](conventions/frontend.md).

## Conventions

Three rules matter enough to repeat here; the full set lives in [`conventions/`](conventions/):

- **Validation at the boundary**: every route handler validates `req.body`/`req.params` with a Zod schema before it touches a controller. Never trust client input past that point.
- **Errors**: services throw typed errors (e.g. `NotFoundError`, `ValidationError`); a single error-handling middleware in `middlewares/` turns those into HTTP responses. Handlers don't `try/catch` and format errors individually.
- **No business logic in routes or controllers.** If you're writing an `if` that isn't about parsing input or picking a status code, it belongs in a service.

| Document | Scope |
| --- | --- |
| [conventions/frontend.md](conventions/frontend.md) | React / TypeScript rules for `apps/web` |
| [conventions/backend.md](conventions/backend.md) | Node / Express / Prisma rules for `apps/server` |
| [conventions/git-and-workflow.md](conventions/git-and-workflow.md) | Commits, branches, PR checklist |
| [`../CLAUDE.md`](../CLAUDE.md) | The conventions block those files resolve against |
