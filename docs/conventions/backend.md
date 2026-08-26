# Backend conventions (`apps/server`)

The frontend rules are adapted from an external ruleset; these are chatty's own, derived from how `apps/server` is already built. Same spirit: concrete enough to point at a file and say "this breaks rule X".

---

## Layering — routes → controller → service

Every feature is a folder under `src/modules/<feature>/` with the same four files:

| File | Job | Must NOT |
| --- | --- | --- |
| `*.schema.ts` | Zod schemas + inferred input types | contain logic |
| `*.routes.ts` | map HTTP verbs/paths to controllers, apply middleware | contain logic |
| `*.controller.ts` | parse input, call one service, shape the response | contain business rules or DB calls |
| `*.service.ts` | business logic + database access | know it was called over HTTP |

The rule that makes this worth the extra files: **a service must not know what called it.** No `req`, no `res`, no status codes in a service — it takes plain arguments and returns plain data or throws.

That constraint is what lets the WebSocket layer reuse the exact same code path. `sockets/index.ts` handling a `message:send` event and `POST /conversations/:id/messages` both call `messagesService.sendMessage(...)`. If the service took `req`, the socket handler would have to fake one, and the two paths would drift apart until sending a message over the socket behaved differently than over HTTP.

Practical test: if you are writing an `if` that is not about parsing input or choosing a status code, it belongs in a service.

---

## Validation at the boundary

**Every route validates its input with a Zod schema before anything else touches it.**

```ts
export async function sendMessageController(req: Request, res: Response): Promise<void> {
    const input = sendMessageSchema.parse(req.body);   // throws ZodError -> 400
    const message = await messagesService.sendMessage(req.userId!, req.params.conversationId!, input);

    res.status(201).json(message);
}
```

`.parse()` (not `.safeParse()`) is deliberate: a `ZodError` propagates to the error middleware, which turns it into a 400 with field details. Handling it inline would mean every controller re-implements the same response shape.

Past that line, input is trusted — services take typed arguments and do not re-validate. One boundary, checked once.

---

## Errors — throw typed, format once

Services throw the typed errors from `lib/errors.ts` (`NotFoundError`, `ValidationError`, `UnauthorizedError`, `ConflictError`). The single `errorHandler` middleware maps each to a status code.

- **Handlers never `try/catch` to format an HTTP response.** One place decides what a `NotFoundError` looks like on the wire.
- **Never leak internals.** An unrecognized error logs the full detail server-side and returns a bare `500` — no stack traces, no driver messages to the client.
- Register `errorHandler` **last**, after all routes.

## Rate limiting

`POST /auth/register` and `POST /auth/login` sit behind the limiters in
`middlewares/rate-limit.ts`. Register is capped tighter than login: a person signs up once, so a real
user never approaches the limit, while enumerating registered addresses needs volume.

Two constraints to keep in mind:

- **Limiters run before controllers.** A rejected request must not reach the database, or probing
  costs the attacker the same as a real signup.
- **Counters live in process memory.** Correct for one server, wrong for two — each instance would
  keep its own tally and the effective limit would multiply. A shared store (Redis) is a
  prerequisite for running more than one instance, not an optimisation.

### Choosing the right error is a security decision

- Wrong password → `UnauthorizedError`, **not** `NotFoundError`. A different response for "no such email" versus "wrong password" tells an attacker which emails are registered.
- Non-participant requesting a conversation → `NotFoundError`, **not** `UnauthorizedError`. "You may not see this" confirms the conversation exists; "no such thing" does not.

---

## Database (Prisma)

- **One shared client**, `lib/prisma.ts`. Never construct a `PrismaClient` per request — Prisma pools connections internally and a per-request client exhausts Postgres.
- **`select` what you need instead of fetching then deleting fields.** Never let `passwordHash` leave the service layer:

  ```ts
  // Wrong — the hash exists in memory and one careless `res.json(user)` leaks it
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  delete (user as Partial<typeof user>).passwordHash;

  // Right — it is never selected
  const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, email: true, displayName: true, avatarUpdatedAt: true, createdAt: true },
  });
  ```

- **Schema changes go through a migration** (`npm run db:migrate --workspace apps/server`), never a manual `psql` edit. The migration files are the history; a hand-edited database is a database nobody else can reproduce.
- **Multi-write operations use a transaction** (`prisma.$transaction`). Creating a conversation and its participants is one unit — a conversation with no participants is corrupt data.
- Indexes are part of the schema, not an afterthought: `Message` already has `@@index([conversationId, createdAt])` because "load a conversation's recent messages" is the app's hottest query.

---

## Authorization — check membership in the service, every time

Every conversation-scoped operation verifies the caller is a participant, **inside the service**, before doing anything else:

```ts
const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: currentUserId } },
});
if (!participant) throw new NotFoundError("Conversation not found");
```

Not in a middleware, not in the controller. Middleware runs per-route, but services are reachable from both HTTP and sockets — a check that lives in middleware is a check the socket path skips.

Authentication (who you are) is the middleware's job — `requireAuth` for HTTP, the `io.use()` handshake for sockets. Authorization (what you may touch) is the service's.

**Participant is the only role.** Group management (add member, remove member, rename) does not add a
stricter check on top of the participant one above — any current participant may do any of it. This
was a deliberate choice, not an oversight: see [ADR 0006](../adr/0006-flat-group-permissions.md)
before assuming a missing admin check is a bug.

---

## Config and secrets

- **`process.env` is read in exactly one place**: `config/env.ts`, validated with Zod at startup. Everything else imports `env`.

  Why: a missing `JWT_SECRET` should stop the process at boot with a clear message, not surface three hours later as a confusing runtime error in one request handler.

- **Never log secrets.** No tokens, password hashes, or `JWT_SECRET` in log output — logs get shipped to places with different access rules than the database.
- `.env` is gitignored. `.env.example` is committed with placeholder values, and every new variable gets added to it in the same commit.

---

## WebSocket handlers

- **Handlers stay thin** — same rule as controllers. They authenticate, then call a service.
- Authentication happens once in `io.use()` during the handshake, using the same JWT and the same payload shape as `requireAuth`. **If the token shape changes, both change in the same commit.**
- Emit through `getIO()` from `lib/socketBus.ts`, never by importing `sockets/index.ts` — that file registers handlers that call back into services, so importing it from a service is a circular import.
- Broadcast to **rooms**, not to a hand-maintained map of socket IDs. Room membership is derived from the database (which conversations the user is in); a map in memory desynchronizes the moment a second server process exists.

---

## Naming

Same core rules as the frontend (verbs for functions, `is`/`has` for booleans, no `res`/`tmp`/`obj`), plus:

- Files are kebab-case, with the module prefix: `messages.service.ts`, not `service.ts`. A stack trace showing five files named `service.ts` is a stack trace you have to decode.
- Service functions are named for the domain action: `sendMessage`, `listConversationsForUser`. Not `handleX` (that is a controller/handler word) and not `doX`.
- Controllers end in `Controller`: `sendMessageController`. It makes the layer obvious at the import site.

---

## Testing

- **Services get unit tests; controllers generally do not.** The logic worth testing lives in services, and they are plain functions — no HTTP mocking needed.
- One behavior per `it`, named for the behavior: `it("throws ConflictError when the email is already registered")`.
- Test the error paths, not just the happy path. The authorization checks above are exactly the kind of thing that silently regresses.
- Run with `npm run test --workspace apps/server` (Vitest).

---

## Things that are always wrong here

- `console.log` in committed code — use `logger` from `lib/logger.ts`.
- `any` — if the type is genuinely unknown, use `unknown` and narrow it.
- Business logic in `routes.ts` or `controller.ts`.
- A `process.env.X` read outside `config/env.ts`.
- Returning a Prisma `User` object straight to the client.
- Swallowing an error into a `200`.
