# Roadmap

What is built, what is next, and why in this order. Update this file **in the same commit** as the
work it describes — a roadmap that lags behind the code is worse than none, because it is believed.

Status: `done` · `next` · `planned`

---

## Phase 1 — Fix what is wrong — `done`

Not new features: three things that were broken or silently incomplete.

| # | Item | Why it came first |
| --- | --- | --- |
| 1 | Unique handles (`@minh`) | Display names are not unique and search deliberately hides emails, so two people with the same name were indistinguishable. Touched the schema, so the longer it waited the more data would need migrating. |
| 2 | `conversation:new` socket event | Joining a room only decides where future messages land. A brand-new conversation has none, so it stayed invisible in the sidebar until someone sent the first message — or until a reload. |
| 3 | Load older messages on scroll | The API had cursor pagination from the start; the client only ever fetched the newest page, so older history was silently unreachable. |

Also done along the way, each because it was found while doing the above:

- **Rate limiting** on `/auth/register` and `/auth/login` — the mitigation the docs already claimed
  existed for register's unavoidable "email taken" disclosure.
- **Tests are typechecked.** `tsconfig.json` used to `include: ["src"]` only. Adding `tests`
  surfaced 18 pre-existing type errors that nothing had ever reported. Build now uses
  `tsconfig.build.json` so tests stay out of `dist/`.
- **Auth request/response types moved to `packages/shared-types`.** The client used to declare its
  own request shape, so adding a required field server-side compiled fine on both sides and failed
  at runtime with a 400.
- **One Vitest version across the monorepo.** Two copies meant two module instances, so
  `expect.extend` in a setup file landed on one while tests ran on the other and every jest-dom
  matcher silently vanished. Run `npm dedupe` after adding a workspace.
- **Seed script** (`npm run db:seed --workspace apps/server`) — e2e scripts had been writing junk
  into the dev database, leaving a search full of duplicate "Minh" accounts.

---

## Phase 2 — Core chat features — `done`

| # | Item | How it ended up |
| --- | --- | --- |
| 4 | Avatars | Upload, re-encode, display. The `avatarUrl` **column was replaced** by `avatarUpdatedAt` — see below. |
| 5 | Read receipts | `lastReadMessageId` on `ConversationParticipant`, `POST /conversations/:id/read`, `conversation:read` broadcast, per-viewer `unreadCount` on `ConversationDTO`. |
| 6 | Typing indicator | The first client→server socket events (`typing:start` / `typing:stop`). Nothing persisted. |
| 7 | Online / offline presence | Derived from connections, never stored. Announced on the first connect and the last disconnect, so extra tabs are not events. |

### Avatars: why the schema changed

The roadmap said `avatarUrl` was "already in the schema". It was, as a free-text column — and storing
a URL there is wrong for two reasons that only show up later:

- **Browsers cache images hard.** A user who replaces their picture keeps seeing the old one unless
  the URL changes, so the column would have to hold a new path per upload — which leaves every
  previous picture on disk forever.
- **The storage backend is in the URL.** Moving files to S3 in phase 5 would mean rewriting every row.

Rocket.Chat, Mattermost and Slack all avoid both the same way: serve avatars from an app-controlled
endpoint keyed by user, and cache-bust with a version parameter. So the column is now
`avatarUpdatedAt` (Mattermost calls it `last_picture_update`), and `UserDTO.avatarUrl` is **derived**
by the server as `{PUBLIC_URL}/users/:id/avatar?v=<timestamp>`. The wire type did not change.

Also part of item 4:

- **Uploads are re-encoded, not stored.** `lib/avatar-storage.ts` decodes to pixels and writes WebP
  256×256. The MIME type a client sends proves nothing — the re-encode is what stops a file being
  served back from this origin as something other than an image. It also strips EXIF, so an avatar
  cannot publish the GPS coordinates the phone put in it.
- **`GET /users/:id/avatar` is the one unauthenticated route.** An `<img>` cannot send an
  Authorization header, and this app keeps its token in localStorage rather than a cookie.

Also done along the way:

- **Typing was echoing back to the typist's own other devices.** Found later, by noticing that typing
  was the only phase 2 feature with no entry under "Known gaps" and going to look for one.
  `socket.to(room)` excludes the socket that sent the event, not the *person* — so someone typing on
  their phone watched their own laptop announce "Minh is typing…" back at them. Fixed with
  `.except(userRoom(userId))`, the same personal room presence already uses for exactly this. The
  roadmap had flagged multi-device as the hard part of presence; it was the hard part of typing too,
  and only presence got the care.
- **`tests/typing.socket.test.ts`, the first test over a real socket connection.** The bug above was
  invisible from below: service tests use a fake io, which proves what a service *asks* to broadcast
  and can say nothing about who receives it. Room membership, exclusions and the handshake all live
  above that line. Same lesson as the avatar endpoint, one layer up.
- **One HTTP-level test, in `tests/avatar-endpoint.test.ts`.** Every avatar `GET` returned 500 while
  all 75 service tests passed: Express's `send` treats a path segment starting with a dot as a hidden
  file and refuses it, and the upload directory is `.data/uploads`. Nothing that tests a service can
  see that. The endpoint now has a test that fails without the fix.
- **`assertParticipant` moved to the conversations service** and is now imported by messages and the
  socket layer. It had been a private copy in `messages.service.ts`; two copies of an authorization
  check are two chances for one of them to be relaxed alone.
- **Unread counts are one raw SQL query**, not one per conversation. Each conversation counts from
  its own read cursor, which Prisma's `groupBy` cannot express.
- **Test fixtures moved to `apps/web/tests/factories.ts`.** Adding `unreadCount` and
  `lastReadMessageId` broke a hand-written fixture in three files at once.
- **Node 22 is now required** to run the web tests — jsdom 30 declares `>=22.22.2`, and on Node 20 the
  suite dies inside undici with `markAsUncloneable is not a function`. Recorded in `engines`.
- **Five convention breaches `scripts/audit-rules.sh` could not see**, found by reading the checklist
  against the new code rather than trusting the script. It greps for constant *arrays* in feature
  component files, so `sizeClasses` maps and a bare `MAX_BADGE_COUNT` slipped through; it checks
  boolean *state* for an `is`/`has` prefix, so a plain `const startsRun` did too. Fixed by moving the
  constants to `constants/`, their types to `types/`, and renaming.
- **`npm run verify`, and three new audit sections, so that does not depend on anyone remembering.**
  Sections 26-28 close exactly the gaps above — any constant in a component file, any non-`Props`
  type in a component file, any boolean `const` without the prefix. Turning them on found one more
  breach in code nobody had touched (`prependedOlder` → `didPrependOlder`); a new rule that reports a
  hit on day one is a rule people learn to ignore, so it was fixed rather than grandfathered.
  `verify` chains typecheck → lint → format:check → test → audit and runs the audit with a new
  `--gate` flag that makes a hit fail the command. On its own `audit:rules` stays a report and exits
  0, because a heuristic that blocks work is a heuristic people route around. The remaining rule is
  in CLAUDE.md, under "Definition of done": a green `verify` is evidence, not proof — it does not run
  the app, and it does not read prose.
- **`npm run format` is now safe to run.** It was not: `tabWidth: 4` is meant for TypeScript, and YAML
  cannot contain tabs, so prettier would silently reindent `docker-compose.yml` from two spaces to
  four. A `.prettierrc` override pins YAML to two. Markdown and `.prisma` are in a new
  `.prettierignore` — prettier pads markdown tables using byte counts, which *misaligns* the
  em-dashes these docs are full of, and it does not know the Prisma schema language at all
  (`npx prisma format` does). `npx prettier --check .` now exits clean.

## Phase 3 — Group and account management — `done` except item 10

| # | Item | How it ended up |
| --- | --- | --- |
| 8 | Group: add/remove member, leave, rename | `done` — see below |
| 9 | Edit profile, change password | `done` — see below |
| 10 | Password reset (needs outbound email) | `deferred` — see below |

### Item 8: group management

`POST /conversations/:id/members`, `DELETE /conversations/:id/members/:userId`, `PATCH
/conversations/:id`. All three follow the same shape as everything else in this app: write over HTTP,
render from a socket event, one source of truth. Two new events carry it —
`conversation:updated` (participants or name changed) and `conversation:left` (you were removed, or
you left).

**No admin role — any participant can add, remove, or rename.** Recorded in
[ADR 0006](adr/0006-flat-group-permissions.md) rather than left as an unstated default, because it is
the kind of thing that looks like an oversight if it isn't written down. Leaving and being removed are
the same function call with the target set to yourself; a group is allowed to end up with zero
participants, the same way a conversation is never deleted.

**`conversation:new` now fires when someone is added to an existing group**, not only at creation —
this was a known gap on the roadmap since phase 2 and is now closed: `addParticipant` sends it to the
new member specifically, after joining their live sockets to the room, the same ordering
`createConversation` already used.

**`conversation:updated` deliberately cannot carry `unreadCount` or `lastMessage`.** Both are
per-viewer, and one payload broadcast to a whole room cannot correctly answer "unread to whom?" for
everyone in it at once — sending the actor's own count to the room would have leaked it into every
other participant's UI. Caught while designing the event, not after shipping it; see the type's doc
comment in `packages/shared-types` and ADR 0006's consequences section.

**Group management lives inline, not in a modal.** The app has no modal/dialog primitive declared
anywhere in its conventions; `GroupMembersPanel` follows the same pattern `NewConversationPanel`
already established — render inline, toggled from a button in `ConversationHeader` — rather than
introduce one.

**`useUserSearch` extracted from `NewConversationPanel`.** Adding a member needed the exact same
search-loading-error state machine a second time; per "no duplicate helper," the first copy was
refactored to use the extracted hook rather than left to drift from the second.

**One flaky-test bug, found and root-caused rather than retried.** The new suite passed repeatedly,
then the full run started failing 48-61 tests at random across files that had nothing to do with
group management — "user does not exist", "email already registered". The cause was this file's own
fixtures: four `register()` calls per test, each a bcrypt hash at cost 12, pushed the slowest tests
past Vitest's default 5s `testTimeout`. Vitest abandons such a test but cannot stop its promise
chain, so it kept querying while the *next* test's `TRUNCATE` wiped the tables — and the wreckage
surfaced in whichever file ran next. Fixed by creating fixture rows directly with `prisma` instead of
going through `register()` (these tests never sign in): 25-61ms per test instead of 300-1400ms, and
green on three consecutive full runs at the default timeout. The trap is now documented in
`tests/setup.ts`, next to the TRUNCATE that springs it.

Known, deliberately deferred rather than missed:

- No confirmation dialog before removing someone or leaving. Nothing else in the app has one either.
- No system message in the chat log for "X added Y" / "X left" / "renamed to Z". Would need a message
  with no author, which is a bigger schema decision than this item asked for — see Known gaps.
- Adding a participant does not backfill their `unreadCount` from before they joined — a newly added
  member's marker starts null, so the existing read-count query treats all prior history as unread,
  same as it would for anyone with an unset marker. Not special-cased; see Known gaps.

### Item 9: profile and password

`PATCH /users/me` changes a display name, a handle, or both. `POST /auth/password` changes a
password, given the current one. Two endpoints rather than one because they are not the same kind of
operation: one edits a resource and answers with it, the other verifies a credential and answers 204.

**Password change lives in the auth module, not with the rest of the profile.** It is the only place
besides `register` that may hash a password, and `PASSWORD_HASH_ROUNDS` having one home is what keeps
the cost factor from quietly differing between the two.

**Its error message is specific — "Current password is incorrect" — where `login`'s is deliberately
vague.** Vagueness there exists to stop an attacker learning which emails have accounts; by the time
this endpoint runs the caller has already proved they hold the account's token, so there is nothing
left to enumerate and precision is what a user needs to try again.

**Its rate limiter is keyed by user id, not IP,** which is why `createAuthLimiter` grew a
`keyGenerator` option. `requireAuth` runs first, so every counted request belongs to a known account:
an attacker cannot spend a victim's budget from somewhere else, and an office behind one NAT does not
share one. Verified by hand against a running server — the limiter's `skip` turns it off when
`NODE_ENV` is "test", so no test in the suite can see it.

**Three rules that two forms both needed were lifted rather than copied.** `displayNameSchema` and
`passwordSchema` came out of `registerSchema` so a profile edit cannot validate a name differently
from a signup; on the web side `constants/validation.ts` moved from `features/auth` to `src/`, and
`CurrentUserAvatar` from `features/chat/components` to `src/components`, because the profile screen
needs both and features may not import from each other.

**Profile settings are a route (`/profile`), not an inline panel.** Everything else secondary in this
app renders inline — starting a conversation, managing a group — but those act on the conversation on
screen. This one edits the account, and putting it in the chat sidebar would mean `features/chat`
importing from `features/profile`, which the frontend conventions rule out.

**Only the changed field is sent.** The server accepts both, but a request carrying a field nobody
touched can overwrite an edit made in another tab.

Known, deliberately deferred rather than missed:

- **Changing a password does not sign other sessions out** — the largest one, and it is in Known gaps
  below rather than buried here, because it limits what the feature is good for.
- Email cannot be changed. It needs proof that the new address is reachable, which is the same
  outbound-email machinery item 10 is waiting on. Shown read-only on the profile form rather than
  omitted, so nobody goes looking for it elsewhere.
- The handle uniqueness check is read-then-write, the same shape `register` uses, and carries the
  same small race. The unique index is what actually prevents a collision; the loser gets a 500
  rather than a 409.

### Item 10: why password reset was stepped over

It is the only item on this roadmap that cannot be finished inside the repository. A reset link has to
reach an inbox, which means an email provider, a verified sending domain, and credentials — none of
which a test can stand in for, and all of which would have to be decided before the first line was
written. Phase 4 needed none of that, so it went first.

Nothing about the work is blocked otherwise: the token table, single-use and expiry rules, and the
rate limit are all ordinary. When it is picked up, the shape to aim for is a `Mailer` interface with a
console transport in development, so the provider is one file rather than a dependency threaded
through the service.

## Phase 4 — Attachments — `done`

| # | Item | How it ended up |
| --- | --- | --- |
| 11 | `Attachment` table, upload, image rendering in the message list | `done` — see below |

### Item 11: image attachments

One image per message, sent through the **same** `POST /conversations/:id/messages` that text goes
through — JSON when there is no file, multipart when there is. The upload middleware passes a
non-multipart body straight through, so one route serves both without a branch in front of it, and
there is still exactly one write path where membership is checked and one broadcast everyone renders
from.

**Serving them needed a decision avatars did not, and it got an ADR.** A profile picture is public and
an unguessable URL is enough; a picture inside a conversation is the content, sent to a specific set
of people. `AttachmentDTO.url` therefore carries a signed token, scoped to that one attachment id,
minted per response, expiring in an hour — see [ADR 0007](adr/0007-signed-attachment-urls.md). A bad
token answers **404 rather than 401**, because 401 would confirm the id exists.

**Both kinds of JWT are signed with the same secret, so they had to be told apart.** An attachment
token presented as a bearer token would otherwise authenticate as a user whose id is an attachment
id. Attachment tokens carry a `typ` claim and `requireAuth` rejects any token that has one; two tests
assert each kind is refused where the other belongs. This is the sort of thing that is invisible from
below — no service test can see it — and it is why the endpoint suite exists.

**The re-encode is the same security control avatars use, and it was verified end to end rather than
assumed.** A JPEG carrying an EXIF marker was uploaded against a running server and fetched back: the
marker is in the input file and absent from the stored WebP. For a photo sent into a group chat that
metadata is a GPS fix.

**`messageSelect` and `toMessageDTO` moved into a fifth file, `messages.mapper.ts`.** The conventions
describe a module as four files, and this is a deliberate exception with a reason: `conversations`
selects a `lastMessage` and must produce the same shape, but `messages.service` already imports
`assertParticipant` from `conversations.service`. Importing back the other way is not merely untidy —
`conversationSelect` is a module-level const built from `messageSelect`, so whichever module loaded
second would read it during the other's temporal dead zone and crash on a startup ordering nobody
chose. Splitting the mapper out breaks the cycle rather than hiding it. Recorded in
[backend.md](conventions/backend.md).

**One test taught something worth keeping.** An assertion that the same attachment gets a different
URL on every read failed: a JWT's `iat` has one-second resolution, so two tokens signed in the same
second are byte-identical. The wire contract had claimed the stronger thing; both it and the test now
say the true one, which is more useful anyway — the URL is *sometimes* stable, which is the worst
case for anything keyed on it.

Known, deliberately deferred rather than missed:

- One attachment per message, enforced by a unique on `messageId`. Several would need a gallery in
  the message list and a decision about what a mixed caption-plus-many-images looks like. Dropping
  the unique later relaxes this without moving any data; going the other way would not.
- Images only. The MIME filter and the re-encode both assume it, and a general file type would need
  a download flow rather than an `<img>`.
- No lightbox — a picture is shown at up to 320×400 in the bubble and cannot be opened full size.
- No upload progress. A 10MB photo on a slow connection shows a disabled button and nothing else.

## Phase 5 — Production readiness — `done`

| # | Item | How it ended up |
| --- | --- | --- |
| 12 | Redis-backed rate limiting | `done` — and the socket adapter with it |
| 13 | Dockerfile + production compose | `done` |
| 14 | CI running `npm run verify` | `done` |
| 15 | Automated e2e (Playwright) | `done` — and it immediately found a real bug |

### Item 12: Redis, for rate limits *and* rooms

The roadmap said "rate limiting", but that was only half of what blocked a second instance. Socket.io
keeps its room registry in process memory too, so a message broadcast by one instance would reach
nobody connected to the other — and `fetchSockets()`, which is how presence answers "who is online",
would only ever see half the users. Both are fixed by `@socket.io/redis-adapter`, and doing one
without the other would have produced a system that scaled its rate limits and silently lost its
messages.

**`REDIS_URL` is optional, and that is a decision rather than laziness.** Required would mean
`npm run verify` and every `npm run dev:server` needed a Redis container to start. Without it both
mechanisms fall back to process memory — correct for one instance, wrong for two — so
`docker-compose.prod.yml` always sets it and the server logs a loud warning if it is missing in
production.

**Verified by running two instances, not by reading the code.** Both pointed at one Redis:

- The register limiter is 10/hour. Six calls to instance A then six to B: the eleventh request
  overall — the fifth on B — came back 429.
- A message sent over HTTP to A arrived on a socket connected to B.
- The presence snapshot B sent to its own client listed a user connected to A.

The same three were then repeated against the containerised stack from item 13.

### Item 13: images and a production compose

`apps/server/Dockerfile` is multi-stage and ships production dependencies only — the build stage's
`node_modules` holds TypeScript, vitest and every type package, none of it reachable at runtime and
all of it attack surface. It runs as `node`, not root. Debian slim rather than Alpine, deliberately:
`sharp` ships prebuilt binaries for glibc and needs libvips compiled from source on musl.

Migrations run at container startup rather than in the image, because they need a database — which
exists at deploy time, not at build time.

`apps/web/Dockerfile` builds the static bundle and serves it from nginx, with the SPA fallback that
client-side routes need (`/profile` is not a file on disk) and two cache rules that matter:
fingerprinted assets forever, `index.html` never — it is the one filename that does not change and
which points at all the ones that do.

**`docker-compose.prod.yml` runs two API instances on purpose.** Not because two is the right number,
but because one is the number that hides every assumption item 12 just removed.

**One bug in this file, found by running it.** Both compose files derived their project name from the
directory, so both owned a container called `chatty-postgres-1`: starting the production stack
silently replaced the development one, pointed at a different volume. The production file now pins
`name: chatty-prod`.

### Item 14: CI

`.github/workflows/verify.yml` runs `npm run verify` against a real Postgres service on Node 22.22.2 —
pinned to the exact minimum, because `engines` requires it and on anything older the web suite does
not fail a test, it fails to start. A second job builds both images, kept separate so a broken
Dockerfile cannot hide behind a green suite or the other way round.

CI adds no new checks. `verify` already existed; what did not exist was anything making it
unskippable.

### Item 15: Playwright, and the bug it found on its first run

Five specs in `e2e/`, driving a real browser against a real server against a real database — its own
database, `chatty_e2e`, because the global setup truncates it.

The centre of it is a two-context test: Alice and Bob register through the actual sign-up form, Alice
starts the conversation, **Bob's sidebar gains it over the socket with no reload**, Bob opens it, and
only then does Alice send. The message cannot have arrived in a page load. Nothing below the browser
can make that assertion — a service test proves what `sendMessage` asked to broadcast, a component
test proves what `MessageList` renders given an array.

**It found a real bug within an hour of existing.** Attaching an image and pressing Enter instead of
clicking send posted a text-only message and silently dropped the picture. The cause was in
`components/button`: it never set `type`, so the HTML default of `submit` applied, and pressing Enter
in a text field activates a form's *first* submit button — which in the composer is the preview's
"Remove attached image". `Button` now defaults to `type="button"`, every real submit already said so
explicitly, and the same trap was open in three other forms. Three unit tests now cover it too, so it
does not need a browser to be caught twice.

Known, deliberately deferred rather than missed:

- **The suite is capped at 10 registrations per run.** `NODE_ENV` is left as `development` so the
  browser meets the same rate limiters a user would, and every spec registers its own accounts. Past
  the cap, tests fail on a 429 that from inside the browser looks like a form that just does not
  submit. Documented at the constant; the escape hatch is `NODE_ENV: "test"`.
- One browser (chromium). Cross-browser matters for a product and not yet for this.
- `test:e2e` is not part of `verify`. It needs two servers and a browser download, and a definition
  of done that takes a minute is one people stop running.

---

---

## Known gaps not on the roadmap yet

- **Handle placement.** Asking for a handle during registration is friction. Alternatives discussed:
  auto-generate one and let the user change it later (Instagram-style), or move the field into
  onboarding. Deliberately deferred, not forgotten.
- **Changing a password does not sign other sessions out.** Nothing is revoked: a JWT stays valid
  until it expires, and this app has no denylist to add one to, so a session opened before the change
  survives it for up to the token's 7 days. That makes the feature good for "I want a better
  password" and **not** sufficient for "someone else has my account" — which is the case a password
  change is most often reached for. Closing it needs a `passwordChangedAt` column checked against
  each token's `iat`, which turns `requireAuth` into a database read on every request, has to be
  mirrored in the socket handshake, and has to disconnect sockets that are already open. That is an
  auth change rather than a profile one, which is why item 9 did not smuggle it in. The UI says so
  out loud after a successful change rather than letting the user assume otherwise.
- **An attachment URL is bearer proof until it expires.** Copied out of the network tab it works
  anywhere for up to an hour, and someone removed from a group can still fetch an image whose token
  they were handed a minute earlier. Inherent to signed URLs rather than an oversight — see
  [ADR 0007](adr/0007-signed-attachment-urls.md) — and the TTL is the whole mitigation.
- **Attachment files are not cleaned up.** Deleting a message cascades the row; the file on disk
  stays, and a send that fails between writing the file and committing the row leaves one nothing
  ever referenced. Same class as the avatar gap below, and it belongs with whatever deletes messages
  rather than in the filesystem layer.
- **No message edit or delete**, no message search.
- **Avatar files are not cleaned up when a user is deleted.** The database row cascades; the file on
  disk does not. Harmless today (nothing deletes users) and the wrong thing to fix in the filesystem
  layer — it belongs with whatever deletes the account.
- **Read receipts cannot be turned off.** Every real messenger lets you disable them, and doing so
  has to be symmetric — if you hide yours, you do not get to see theirs.
- **A read marker pointing outside the loaded page shows no "Seen".** Correct rather than wrong (the
  alternative is guessing), but it means a receipt can disappear when you scroll far enough back.
- **Presence is binary.** No "last seen at", which would need a column and a decision about who is
  allowed to see it.
- **Typing is only shown for the conversation you have open.** The event arrives for every
  conversation you are in — `use-typing-participants` drops the rest on purpose, because a sidebar
  badge for something that expires in seconds is mostly flicker. Real messengers do show it there,
  so this is a judgement call rather than a settled answer.
- **Two test runs against `chatty_test` at once corrupt each other.** `tests/setup.ts` truncates
  before every test, so a second run — another terminal, another agent, a watch mode left open —
  deletes the first one's fixtures mid-test. It surfaces as unique-constraint and "participant does
  not exist" failures scattered across unrelated files, which reads as a broken suite rather than a
  busy database. The seed script has a guard for pointing at the wrong database; this is the same
  class of problem and has none.
- **No system messages for group changes.** "An added Binh", "Chi left", "renamed to Weekend
  football" appear nowhere in the chat log — only in `conversation:updated`, which a client currently
  applies silently. Doing this properly needs a message with no author (`Message.authorId` is
  required, referencing a `User`), which is a schema decision bigger than phase 3's add/remove/rename
  scope. Deliberately deferred, not missed.
- **A newly added group member's unread count includes the group's entire prior history.** Their read
  marker starts null, and the existing unread query treats a null marker as "count everything" — it
  has no way to distinguish "never read" from "wasn't here yet". `ConversationParticipant.joinedAt`
  already exists and could bound the query, but doing that for new joiners only (and not everyone
  else) is a second axis on unread math that was not asked for.
- **No admin role for groups.** Any participant can rename, add, or remove any other — see
  [ADR 0006](adr/0006-flat-group-permissions.md). Fine for a learning project; would need real thought
  before this became a product other people rely on.

## Verification bar

Nothing is "done" here until this passes, **and** an end-to-end run against the real API exercises the
actual behaviour — not just the types:

```bash
npm run verify
```

It chains typecheck → lint → format:check → test → audit, stops at the first failure, and fails on an
audit hit. Run it on **Node 22 or newer**: on Node 20 the web suite does not fail a test, it fails to
start, inside jsdom, with an error that looks nothing like a version problem.

The second half of that sentence is not optional. Phase 2 shipped an avatar endpoint that returned
500 for every request with all 75 server tests green — see CLAUDE.md, "Definition of done".
