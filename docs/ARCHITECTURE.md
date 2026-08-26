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

Four core tables:

- `User` — account + profile
- `Conversation` — a 1-1 or group thread (no separate "DM" vs "group" table; a 1-1 chat is just a conversation with two participants)
- `ConversationParticipant` — join table between `User` and `Conversation`, and where per-user state lives: `lastReadMessageId` is here, not on `Message`, because "read" is a fact about a person and a group of ten has ten different answers for the same message
- `Message` — belongs to a `Conversation`, authored by a `User`

Modeling 1-1 chat as a conversation with exactly two participants (rather than a separate table) means group chat isn't a bolt-on later — it's the same code path from day one.

Two things deliberately have **no** table:

- **Typing.** It fires several times a sentence and is worthless a few seconds later.
- **Presence.** A stored "online" flag is a lie waiting to happen — the process that would clear it is exactly the one that crashed, and every stale row then shows someone as online forever. It is derived from live socket connections instead, which cannot go stale because there is no state to forget.

## Files (`lib/avatar-storage.ts`)

Avatars are the only uploaded files, and the URL for one is **derived, never stored**. The database keeps `User.avatarUpdatedAt`; the server builds `{PUBLIC_URL}/users/:id/avatar?v=<timestamp>` from it.

That is the same shape Rocket.Chat and Mattermost use, and it buys two things a stored URL cannot: the version parameter changes the moment a picture does, so browsers can cache avatars indefinitely without ever showing a stale one; and no row contains a storage path, so swapping local disk for S3 is a change to `lib/avatar-storage.ts` and nothing else.

Uploads are decoded and re-encoded to WebP rather than stored as they arrived. That is a security control, not a size optimisation: a browser decides what a file is by sniffing its bytes, so anything that survives a MIME check could otherwise be served back from this origin as something other than an image.

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
