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

## Phase 3 — Group and account management — `done`

| # | Item | How it ended up |
| --- | --- | --- |
| 8 | Group: add/remove member, leave, rename | `done` — see below, and revisited in phase 6 |
| 9 | Edit profile, change password | `done` — see below |
| 10 | Password reset (needs outbound email) | `done` — stepped over here, finished last; see below |

### Item 8: group management

`POST /conversations/:id/members`, `DELETE /conversations/:id/members/:userId`, `PATCH
/conversations/:id`. All three follow the same shape as everything else in this app: write over HTTP,
render from a socket event, one source of truth. Two new events carry it —
`conversation:updated` (participants or name changed) and `conversation:left` (you were removed, or
you left).

**No admin role — any participant can add, remove, or rename.** Recorded in
[ADR 0006](adr/0006-flat-group-permissions.md) rather than left as an unstated default, because it is
the kind of thing that looks like an oversight if it isn't written down. **Phase 6 changed this**:
groups now have an owner, and ADR 0006's decision is superseded by
[ADR 0008](adr/0008-group-owner-role.md). It was not an oversight, and it was still the wrong
default — the first person to open the panel asked "is everyone the owner?" within a minute. Leaving and being removed are
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
introduce one. **Phase 16 introduced one** (`hooks/use-dialog.ts`) and this panel deliberately did
not move into it: group management acts on the conversation on screen, and a dialog that covers the
conversation you are editing the membership of is worse than a panel above it.

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

Known, deliberately deferred rather than missed (the second and third were **closed by phase 6**):

- No confirmation dialog before removing someone or leaving. Nothing else in the app has one either.
- ~~No system message in the chat log for "X added Y" / "X left" / "renamed to Z".~~ Done in phase 6:
  the schema decision it was waiting on — a message with no author — was made there.
- Adding a participant does not backfill their `unreadCount` from before they joined — a newly added
  member's marker starts null, so the existing read-count query treats all prior history as unread,
  same as it would for anyone with an unset marker. Not special-cased; see Known gaps.

### Item 9: profile and password

`PATCH /users/me` changes a display name, a handle, or both. `POST /auth/password` changes a
password, given the current one. Two endpoints rather than one because they are not the same kind of
operation: one edits a resource and answers with it, the other verifies a credential and returns the
replacement access token required after it invalidates every older session.

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

**Phase 16 kept the route and stopped it replacing the screen.** `/profile` now renders `ChatPage`
and a dialog over it, composed as siblings in `app.tsx` — which is the one place both are in scope,
so the cross-feature import is still not made. The URL is unchanged, so the deep link still works and
Back closes the dialog.

**Only the changed field is sent.** The server accepts both, but a request carrying a field nobody
touched can overwrite an edit made in another tab.

Known at the end of item 9, then closed by item 10:

- ~~Changing a password does not sign other sessions out.~~ Both password-change paths now update
  `passwordChangedAt`, disconnect live sockets and issue the caller a replacement token.

Still deliberately deferred rather than missed:

- ~~Email cannot be changed.~~ Built in phase 13, once the outbound-email machinery item 10 was
  waiting on existed. It is not a field on this form and never will be: it takes effect when a link
  in the new mailbox is opened, not when the request returns, so it has its own form and its own two
  endpoints under `/auth`.
- The handle uniqueness check is read-then-write, the same shape `register` uses, and carries the
  same small race. The unique index is what actually prevents a collision; the loser gets a 500
  rather than a 409.

### Item 10: password reset, stepped over and then finished

It was the only item on this roadmap that cannot be *finished* outside a deployment: a reset link has
to reach an inbox, which means a provider, a verified sending domain and credentials, none of which a
test can stand in for. So phases 4 and 5 went first, and the flow was then built against the shape
this file predicted — a `Mailer` interface with a console transport, so the provider is one file
(`lib/mailer.ts`) rather than a dependency threaded through the service.

`POST /auth/password-reset` always answers 204, whether or not the address has an account: a
different status, message or delay is a way to ask who is registered here. `POST
/auth/password-reset/confirm` redeems the link — 32 random bytes, stored only as a SHA-256, single
use, one hour. SHA-256 rather than bcrypt because what is being hashed is already unguessable; a slow
hash defends against nothing here.

**It also closed the largest gap on this list.** A reset exists for "someone else has my account",
which is worth nothing if the sessions they opened keep working. `User.passwordChangedAt` is now
written by both the reset and the ordinary password change, `verifyAccessToken` refuses any JWT whose
`iat` is older than it, and the same check runs in the socket handshake — with the account's live
sockets disconnected on the spot. The caller gets a replacement token in the response, because their
own session is one of the ones that just ended.

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

Eleven specs in `e2e/`, driving a real browser against a real server against a real database — its own
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

- **The suite runs with the rate limiters off** (`NODE_ENV: "test"`). It ran as `development` first,
  so the browser would meet the same middleware a user does; what that bought was a ceiling of about
  eight tests, after which `/auth/register`'s 10-per-hour limit turned every new spec into a sign-up
  form that silently would not submit. No spec ever asserted a limit, so the coverage was imaginary
  and the trap was real. The limiters are exercised by hand instead — see phase 3, item 9.
- One browser (chromium). Cross-browser matters for a product and not yet for this.
- `test:e2e` is not part of `verify`. It needs two servers and a browser download, and a definition
  of done that takes a minute is one people stop running.

---

---

## Phase 6 — What the first real user noticed — `done`

Not planned work. Someone opened a group, watched a member leave, and asked three questions in a row:
where is the notice, why did that person's messages lose their face, and is everybody the owner here?
All three were on the list below as known gaps, which is a fair description of what a known gap is —
a bug somebody has already agreed to be surprised by later.

| # | Item | How it ended up |
| --- | --- | --- |
| 16 | A message keeps its author after they leave | `done` — the bug behind the missing avatar |
| 17 | System messages for group events | `done` — [ADR 0009](adr/0009-system-messages.md) |
| 18 | A group owner, and what only they may do | `done` — [ADR 0008](adr/0008-group-owner-role.md) |

### Item 16: a message is not a pointer into the participant list

`MessageDTO` carried `authorId`, and the client resolved it against
`conversation.participants` to find a name and an avatar. That answers "who is in this conversation
now", which is a different question from "who wrote this" — and the two diverge the moment anyone
leaves. Their messages stayed in the log with a blank margin where the avatar had been and, in a
group, no name above the bubble.

`MessageDTO.author` is now the whole `UserDTO`, selected with the message. One join per page of
messages, in exchange for history that keeps its faces. `authorId` is gone rather than kept
alongside: two spellings of the same fact is how they drift.

Two smaller things fell out of it, both real:

- **`isGroup` is a prop, not a headcount.** The message list decided whether to print author names
  with `participants.length > 2`, so a three-person group that lost a member stopped naming
  anybody — dropping the names from exactly the messages that had just become unattributable.
- **One projection for a `UserDTO`.** Three modules had grown their own copy of the same five-line
  mapping (users, conversations, and now messages), and `avatarUrl` — built from a timestamp, with a
  cache-busting `?v=` — is precisely the field a fourth copy forgets. `users.mapper.ts` now owns it,
  the way `messages.mapper.ts` owns a message.

### Item 17: the log says what happened

"An added Binh", "Chi left the group", "An renamed the group to Weekend football" — a real `Message`
row with `kind = SYSTEM` and no author, written with the conversation timestamp and broadcast on the
same `message:new` everyone already listens to. Phase 7 put the surrounding membership/name change
in that transaction too. It survives a reload, sits in
order among the messages around it, and reaches people who were offline when it happened; a notice
rendered client-side from `conversation:updated` does none of the three.

The sentence is rendered once, when the event happens, and stored. The alternative — ids resolved at
read time — has to resolve them against the people in a group event, who are exactly the people most
likely to have left it. That is item 16's bug, wearing a different hat. See
[ADR 0009](adr/0009-system-messages.md) for the trade-off this accepts: an old line does not follow a
later rename.

System lines never count towards an unread badge, and that falls out of the SQL rather than being
special-cased — the unread query compares authors, and `null <> $viewer` is null, not true.

### Item 18: somebody owns the group

The creator owns it. Only the owner renames it or removes anyone else; **anyone may invite, and
anyone may leave** — an owner who could hold people in a group would be a worse failure than a group
with no owner. An owner on their way out hands it to the longest-standing member left, because the
alternative is a group nobody can ever administer again: no code path would exist to grant the role.

Pre-existing groups have no recorded creator, so the migration promotes each group's
longest-standing participant. Without that backfill every group made before this change would have
been permanently ownerless.

The UI states the rule rather than enforcing it silently: the rename field is disabled with a line
saying who can change it, remove buttons are absent for members, and the owner's row carries a badge
so it is obvious who to ask. `assertOwner` throws a new `ForbiddenError` (403) rather than the 404
`assertParticipant` uses — there is nothing left to hide from someone who is already in the group,
and a 404 would leave the UI unable to explain itself.

Known, deliberately deferred rather than missed:

- No manual hand-over: an owner cannot promote someone while staying in the group. One endpoint and
  one button when it is wanted; the check it needs already exists.
- No second admin and no demotion. A second tier needs a rule for what an admin may do to another
  admin, and nothing has asked that question yet.
- Still no confirmation dialog before a kick or a leave, in line with the rest of the app.

## Phase 7 — Security and consistency under concurrency — `done`

Phase 6 made the visible behaviour right; this phase makes the same behaviour stay right when two
requests arrive together or one database write fails. The trigger was a review of the uncommitted
Phase 6/password-reset work before it entered history, not a new product surface.

| # | Item | How it ended up |
| --- | --- | --- |
| 19 | Password-reset links under concurrency | A per-user row lock serialises issuance; redeem atomically claims a still-unused, still-live token, so exactly one concurrent request can change the password. |
| 20 | Password-reset account-enumeration hardening | Known and unknown addresses share a 300ms response floor; mail delivery is detached from the HTTP path, so provider latency/failure cannot change the generic 204. |
| 21 | Atomic group transitions | Add, kick, leave, rename, owner transfer, system messages and `updatedAt` now commit or roll back together. Socket effects happen only after commit. |
| 22 | Database and authorization invariants | PostgreSQL enforces one owner per non-empty group and `Message.kind`/author consistency; conversation writes share a row lock and re-check membership after it. |

### Reset means one link, even with two requests

The old sequential test proved that a token failed after one completed redemption. It did not prove
two requests could not both read `usedAt = null`, hash different passwords and commit in parallel.
Redemption now claims the token with one conditional update (`usedAt IS NULL`, `expiresAt > now`)
inside the same transaction as the password update. A zero-row claim is the same invalid-link error
as an expired or imaginary token. Fault-injection tests also prove a failed password update rolls the
claim back rather than burning a usable link.

Issuance had the mirror race: two requests could both invalidate the old set before either created a
replacement, leaving two current links. `SELECT ... FOR UPDATE` on the user makes invalidate + create
one ordered transition, and a concurrency test asserts only one unspent row survives.

The endpoint's body and status were already generic, but an unknown address returned immediately
while a known one performed writes and sent mail. Both paths now enter the same transaction and wait
for a 300ms response floor. Delivery starts after the token commits but is not awaited: a provider
only runs for a real account, so allowing its latency or failure to affect HTTP would recreate the
oracle. The current console mailer is process-local; a real provider needs a durable outbox, recorded
below rather than hidden by this response policy.

### A group transition is one fact

All mutations of one conversation take the same `Conversation` row lock. Permission checks run after
that lock, then the membership/name change, system messages, owner hand-over and timestamp update run
inside one interactive Prisma transaction. The result has a clear order under concurrency. If the
owner and their likely successor leave together, one finishes first and the second chooses from the
membership that actually remains.

`sendMessage` joins the same protocol. It keeps a cheap membership check before attachment work, but
re-checks after taking the lock; a send racing a kick either commits before the kick or sees the
completed removal and fails. It cannot pass authorization in one state and write in another.

Socket.IO is deliberately outside the database transaction and runs only after commit. A realtime
event can be lost if the process dies in that narrow window, but durable state never lies and reload
repairs the screen. Guaranteed event delivery would require a transactional outbox — see
[ADR 0010](adr/0010-serialize-conversation-writes.md).

### The database owns the invariant

Application checks are not enough for imports, maintenance scripts or a future code path. Two raw
SQL migrations add the pieces Prisma 5 cannot declare:

- an OWNER-only partial unique index: at most one owner per conversation;
- a deferred constraint trigger: every non-empty group has one owner at commit, direct conversations
  have none, and an empty group remains allowed;
- a `Message` check constraint: `SYSTEM` means no author and `USER` means an author exists.

The owner check is deferred because a hand-over briefly passes through zero owners inside an
otherwise valid transaction. The migration validates existing rows too. Database tests attempt each
invalid state directly, concurrency tests exercise the races, and fault-injection tests force system
message writes to fail and prove no membership/name/socket side effect escapes.

## Phase 8 — A message you can take back — `done`

The largest feature gap the README had listed since phase 1: everything in this app could be sent and
nothing could be changed. A typo stayed a typo, and a photo sent to the wrong group stayed there.

| # | Item | How it ended up |
| --- | --- | --- |
| 23 | Edit your own message | `PATCH .../messages/:messageId`, author-only, text-only. Records `editedAt`; the list marks the bubble "edited". |
| 24 | Delete your own message | `DELETE .../messages/:messageId`, author-only. Tombstones the row, empties the text, and removes the image row *and* its file. |

### Deleting is a tombstone, and that is not squeamishness

The obvious implementation — `DELETE FROM "Message"` — breaks two things in this schema that point at
a message id with no foreign key to protect them:

- `ConversationParticipant.lastReadMessageId` is a plain column on purpose (its own schema comment
  explains why a `SetNull` relation would be worse). `countUnreadByConversation` LEFT JOINs the marker
  and reads a miss as "this person has read nothing", so deleting the newest message in a conversation
  would have relit the badge on its **entire history** for everyone who had finished reading it.
- Paging hands the oldest loaded id back as a Prisma cursor. A cursor row that no longer exists fails
  the request for the next page rather than returning it.

So the row survives with `deletedAt` set, holding its place in the order, and the client renders
"This message was deleted" in it. Both failures have a test: one asserts a reader whose marker pointed
at the deleted message still sees zero unread, the other that the message keeps its position in
`listMessages`.

What does not survive is the content. `content` is emptied in the same write and the attachment row is
deleted, so a client that forgets to check `deletedAt` renders nothing rather than the message. A check
constraint (`"deletedAt" IS NULL OR "content" = ''`) makes that a property of the data instead of a
promise one service keeps — the same argument phase 7 made for the owner invariant. A second
constraint keeps `SYSTEM` messages immutable, because ADR 0009 already treats the group log as history
and nobody authored it to begin with.

Deleting the image also closes half of the "attachment files are not cleaned up" gap below: the file
is removed after the transaction commits, in that order for the same reason `sendMessage` writes it
before the row — a crash leaves an unreferenced file rather than a message showing a broken image. A
failure to unlink is logged rather than thrown: the message *is* deleted, and failing the request
would tell the caller otherwise.

### An edit does not count as activity

`editMessage` deliberately leaves `Conversation.updatedAt` alone. Fixing a typo in something sent last
week is not a reason to throw that thread to the top of everyone's sidebar with nothing new in it. The
sidebar *preview* still changes, because it reads the newest message rather than a stored copy — which
is why the client re-lists conversations on `message:updated` for the text and not for the ordering.

Both operations take the same `Conversation` row lock as every phase 7 mutation and re-check membership
after it, so a delete racing a kick has one honest order. One socket event, `message:updated`, carries
the whole message for both cases: the DTO's own `editedAt` / `deletedAt` say which happened, so a client
replaces by id with nothing to branch on. Deleting twice is idempotent and broadcasts once.

This phase originally left out edit history, a time limit, and "delete for me". Phase 15 closes all
three: edit and delete-for-everyone share an eight-hour author window, history is append-only, and
per-participant visibility is applied consistently to message pages, search, sidebar previews and
unread counts.

## Phase 9 — Mail that survives a crash — `done`

The gap where the code was quietly lying. The README said password reset worked, and at repository
level it did — tokens, expiry, session invalidation, all real. But the link was handed to a
fire-and-forget `void promise.catch(log)`, so one bad minute at the provider, or a process dying at
the wrong moment, lost it with nothing left behind to say it had been owed.

| # | Item | How it ended up |
| --- | --- | --- |
| 25 | Transactional outbox | `OutboxMessage`, written by `enqueueMail` **inside the caller's transaction**. The reset token and the promise to mail it commit or roll back together. |
| 26 | Delivery worker | Polls, claims with `FOR UPDATE SKIP LOCKED`, retries with exponential backoff, gives up after six attempts, and redacts the body on every terminal outcome. |

See [ADR 0011](adr/0011-transactional-outbox-for-mail.md) for the reasoning in full.

### The clock bug this uncovered

The suite passed four runs in five, which is the worst possible result. The cause was not the tests:

`nextAttemptAt` was `@default(now())`, and **Prisma evaluates `now()` in the client**, using the
application's clock. The worker's claim compares that column against PostgreSQL's `NOW()`. Two
clocks. A machine a few milliseconds ahead of its database writes a row that is not due the instant
it is created — and on a real deployment, where the app and the database are different hosts, the
skew is not milliseconds. It would have shipped as mail that sometimes just sits there, with no error
anywhere and a table full of PENDING rows that look perfectly fine.

The rule that came out of it, and that anything scheduled must follow: **every value compared against
the database clock is written by the database.** `nextAttemptAt` is now
`@default(dbgenerated("CURRENT_TIMESTAMP"))` and the retry schedule is `NOW() + make_interval(...)`
in SQL. `createdAt` and `sentAt` are only ever read by people, so they stay ordinary.

A second, smaller version of the same lesson is in the tests: `NOW()` is *transaction start* time, so
two statements issued in order are not guaranteed to see it advance. A test that wants a row to be
due sets it an hour into the past, not to "now".

### What is still not built

Delivery is at-least-once. The claim counts its attempt and takes a two-minute lease in one
statement, so a crash mid-send does not immediately hand the row to another instance — but a crash
*after* the provider accepted and *before* the row is marked sent still duplicates. Closing that
needs an idempotency key the provider honours, which is a provider decision.

And the provider itself is still a `ConsoleMailer`. That is deliberate, not unfinished: `mailer.ts`
refuses to pick a transport from an env var, because a half-configured provider that silently falls
back to the console is exactly how a password reset appears to work in production and reaches nobody.
The swap is now genuinely one file, which it was not before this phase.

## Phase 10 — Mail that actually sends — `done`

Phase 9 built the durable half and stopped one step short: the transport was still `ConsoleMailer`,
so nothing left the process. "Password reset works" was true of everything except the part the user
experiences.

| # | Item | How it ended up |
| --- | --- | --- |
| 27 | A real transport | `SmtpMailer` over nodemailer. SMTP rather than a provider SDK, so the provider is a connection string instead of a dependency. |
| 28 | Configuration that cannot fail quietly | `MAIL_TRANSPORT` has no default; five misconfigurations now stop the boot instead of degrading. |
| 29 | Mailpit in `docker-compose.yml` | A real SMTP server and a web inbox on :8025, so development reads the mail rather than grepping a log. |
| 30 | Stable `Message-ID` | The outbox row id, so an at-least-once retry is recognisably the same message. |
| 31 | Outbox retention | Settled rows swept after 30 days by an hourly timer. PENDING is never touched, whatever its age. |

### Reversing the "no env var" decision, and why that is not a climbdown

`mailer.ts` carried a comment arguing the transport must be a code change, because "a half-configured
provider that silently falls back to the console is how a password reset appears to work in production
and reaches nobody."

That was right about the failure and wrong about its cause. The danger is the **silence**, not the
variable. So the variable exists and the silence does not:

- `MAIL_TRANSPORT` has no default. A deployment that never considered mail fails to start.
- `smtp` without `SMTP_URL` or `MAIL_FROM` fails to start.
- `console` with `NODE_ENV=production` fails to start — that combination writes every reset link to
  stdout.
- `SMTP_URL` must carry an `smtp://` or `smtps://` scheme. **This one was found by its own test.**
  `z.string().url()` accepts `localhost:1025`, because `new URL()` reads `localhost:` as a scheme —
  which is exactly the string someone pastes when they drop the prefix, and it would have failed at
  the first send, hours later, inside a worker.

All five are exercised against the real binary, not only the schema: the process refuses to listen.

### A second bigint cast, in the same shape as the phase 9 clock bug

`make_interval(days => $1)` fails with `function make_interval(days => bigint) does not exist`. Prisma
sends a JS number as `bigint`; `days` is `integer`, and bigint→integer is an *assignment* cast, which
PostgreSQL will not apply implicitly. `secs` is `double precision`, where the implicit cast does
exist — which is why the phase 9 claim query gets away without one and the retention sweep does not.
Both call sites now cast explicitly.

### What is still not closed

Delivery remains at-least-once. `Message-ID` makes a duplicate recognisable to a receiver that
deduplicates, and nothing more — a crash after the SMTP server accepted but before the row is marked
sent still produces a second copy for a receiver that does not. Removing that needs provider-side
idempotency, which SMTP does not define.

## Phase 11 — Refuse to start wrong, and prove two instances — `done`

Everything here is host-independent, which is the point: it was done while the hosting decision was
still open (see [DEPLOYMENT.md](DEPLOYMENT.md)), because none of it depends on the answer.

| # | Item | How it ended up |
| --- | --- | --- |
| 32 | `SINGLE_INSTANCE` declaration | In production, either `REDIS_URL` or `SINGLE_INSTANCE="true"`. Neither, and the server does not boot. |
| 33 | Readiness split from liveness | `/health` says the process answers; `/ready` says the database and Redis do, and returns 503 when they do not. |
| 34 | Security headers | Helmet on the API, with the one default that had to change. |
| 35 | WebSocket-only socket transport | Long-polling cannot survive two instances without session affinity. |
| 36 | `scripts/smoke.sh` | 17 checks against a running deployment, safe to point at production. |
| 37 | The two-instance path, actually run | Not asserted — run, for the first time. |

### The README's largest gap, closed by asking rather than requiring

"Running more than one instance requires `REDIS_URL`, and nothing enforces it" had been the top item
under Known gaps since phase 5. Without Redis, two instances do not fail — they behave as two
separate apps, and a message sent to one never reaches anyone connected to the other. The guard was a
log warning, and a warning is a thing people scroll past.

Requiring Redis in production would have been wrong: a single instance in production is a legitimate
shape, and it is the shape of this project's first deployment. So the rule is a **declaration**, not a
dependency — in production, point at Redis or say out loud that there is only one of you. Both are
fine; saying neither is the case that used to fail silently. Verified through the real
`config/env.ts` in five configurations, not against a copy of the schema.

### Helmet's default that would have broken every picture

`Cross-Origin-Resource-Policy: same-origin` is the right default for a server that renders its own
pages. This one does not: avatars and attachments are served from the API into an `<img>` on the web
app's origin, which is a different origin in every environment this app has. Left alone, every image
in the product stops loading — and the response is still a perfectly good 200, so nothing that
asserts on a response body can see it. Set to `cross-origin`, with a test on the header and a
cross-instance fetch of a real uploaded avatar to prove it.

A CSP is deliberately *not* set on the API: it is a JSON and image server with no pages to govern,
and setting one there would read as though the web app were covered when it is not. The web app's own
CSP is still missing, and is listed under Known gaps rather than half-done.

### What the two-instance run found

`docker-compose.prod.yml` has claimed since phase 5 that two instances behave as one system. Nothing
had ever checked it — the test suite is one process and Playwright talks to one server. Built and
run: two API containers on separate ports, one Postgres, one Redis.

- A socket connected to **api-2** receives a message written through **api-1**. So do edits, deletes
  and presence. The Redis adapter is genuinely carrying broadcasts across processes.
- **Both containers run `prisma migrate deploy` at startup**, which is a race. It resolved correctly —
  one applied every migration, the other reported "No pending migrations to apply" — because Prisma
  takes an advisory lock. Worth knowing rather than assuming; on a host with a release phase, that is
  where migrations belong regardless.
- An avatar uploaded through api-1 is served by api-2, because they share a volume. This is the exact
  behaviour that per-machine disks would break, and it is why object storage is a prerequisite for
  some hosts and not others.
- `smoke.sh` run twice in a minute got a 429 — the shared rate limiter working across instances, and
  a good sign. The script reported it as ten unrelated failures, which was the script's fault: it now
  detects that case and exits 2, distinct from 1.

## Phase 12 — Finding a message — `done`

Editing and deleting were phase 8; finding was the half left over. A chat app without search stops
being useful at exactly the point its history becomes worth keeping.

| # | Item | How it ended up |
| --- | --- | --- |
| 38 | `Message.searchVector` | A **GENERATED** column, `to_tsvector('simple', content)`, with a GIN index. |
| 39 | `GET /search/messages` | Global across every conversation you are in, newest first, cursor-paged. |
| 40 | Search panel in the sidebar | Debounced as you type; a result opens its conversation. |

### A generated column, not a trigger

PostgreSQL keeps `searchVector` in step with `content` by construction. That is not a tidiness
preference — it removes a whole class of bug. There is no backfill for existing rows, no trigger for a
future write path to forget, and no way for the index to disagree with the message it points at.
Phase 8 gets two behaviours for free as a result: an edit changes what the message matches, and a
delete empties `content` so the tombstone stops matching, without either code path knowing search
exists. Both have a test.

### `simple`, and the diacritics it keeps

The `english` text search configuration stems and strips stop words for one language. This app's
messages are mostly Vietnamese, where that is wrong: it would discard "a", "the" and "is" as noise
and do nothing useful to anything else. `simple` lowercases and splits on word boundaries — exactly
right for Vietnamese, and merely unambitious for English, where "running" will not match "run".

What it does **not** do is ignore diacritics, so `hen gap` does not find `hẹn gặp`. That is a real gap
for the people most likely to use this, and the fix is written out in full in the migration: the
`unaccent` extension plus an IMMUTABLE wrapper, because a generated column may only call immutable
functions and `unaccent` is declared STABLE. Not taken on, for the same reason object storage was
not: it is a host-level dependency, and the host is not chosen. A test pins the current behaviour so
the change is noticed rather than assumed.

### Authorization is a join, not a filter

The membership check is inside the query — `JOIN "ConversationParticipant" ... AND p."userId" = $1` —
rather than a pass over the results afterwards. Filtering afterwards means the database handed back
rows the caller may not see, with one line of application code standing between that and a response.

The consequence is that leaving a group removes its messages from your search, which is the same rule
the sidebar already follows: a group you left disappears from it entirely. That is deliberate, and it
is the one place where "your history" and "what you can search" differ.

### Two queries, on purpose

The match runs in raw SQL, because `@@ websearch_to_tsquery` is not something Prisma's query builder
can express. It returns ids only; a second, ordinary Prisma read turns those into DTOs using the same
`messageSelect` every other message response shares. Hand-writing the join in SQL would mean a second
mapper to keep in step with `messages.mapper.ts`, which is the divergence that mapper exists to
prevent.

`websearch_to_tsquery`, not `to_tsquery`, and the difference is a 500: `to_tsquery` throws a syntax
error on a bare space, so the first person to search for two words would have got one. Punctuation
soup is a test case for the same reason.

Results are newest-first rather than ranked. In a chat the thing being looked for is almost always
the recent one, and a relevance score would put a three-year-old message above this morning's for
saying the word twice.

## Phase 13 — What an account needs before real people have one — `done`

Four things every messenger has and this one did not, and they are the same four because they are
the same subject: an account is something you can move, hand on, hide behind, and leave.

| # | Item | How it ended up |
| --- | --- | --- |
| 41 | Change your email | `POST /auth/email` + `POST /auth/email/confirm`. The new address is parked on an `EmailChangeToken` until a link sent to it is opened; the old address is warned in the same transaction. |
| 42 | Hand a group over | `PUT /conversations/:id/owner`, owner-only, on the phase 7 lock. Demote then promote, with a system line. |
| 43 | Turn read receipts off | `User.readReceiptsEnabled`, plus a **second** marker column that only advances while they are on. |
| 44 | Delete your account | `DELETE /users/me`. The row, its tokens, its memberships and its avatar file go; its messages stay, without a name on them. |

### An unverified address is not a credential

The obvious implementation writes `User.email` and mails a "you changed your email" notice. That is
wrong in a way that is easy to miss: the address on an account is where a password reset is
delivered, so writing an unproven one hands the account to whoever typed it — including to the
person who typed it wrong and can now recover neither.

So nothing about the account changes when the request returns. The new address lives on a token row
for an hour, and `User.email` moves only when the link mailed to it is opened. The uniqueness of the
address is re-checked at that second step against the database's own index rather than trusted from
the first, because the gap between them is an hour wide and somebody else can register it in the
meantime — a `P2002` caught and turned into a 409, not the 500 an unhandled Prisma error would be.

Two mails, not one. The second goes to the **old** address while it is still the address that can do
something about it, and it is sent at request time rather than after confirmation: a warning that
arrives once the door has closed is a log entry, not a warning.

Sessions are deliberately left alone. This changes what you sign in *with*, not whether the person
signed in is still you — the password is untouched, and the warning covers the case where it is not.

### The owner hand-over the phase 7 migration was already waiting for

`ConversationParticipant` carries a partial unique index (`WHERE role = 'OWNER'`) and a **deferred**
constraint trigger, and the migration's own comment says why it is deferred: "an owner hand-over
briefly has zero owners between DELETE and UPDATE inside an otherwise-valid transaction." That
hand-over did not exist yet. It does now, and it needed no schema change at all — demote first (the
per-statement unique index would refuse a second owner), promote second, and the deferred trigger
re-checks at commit.

Two hand-overs racing are settled before either reaches the constraint: both take the `Conversation`
row lock, and the one that arrives second finds it is no longer the owner and gets a 403. The
invariant is still there underneath as the thing that would catch a mistake — the point is that the
application never asks it to, so the failure a user sees is a sentence rather than a 500.

### Read receipts, and why one boolean is not enough

The setting is symmetric: hide yours and you stop seeing everyone else's. That half is
straightforward. The hard half is the sentence "turning it back on must not reveal what you read
while it was off", and it rules out the obvious design — a flag consulted at read time, exposing
`enabled ? lastReadMessageId : null`. Under that, flipping the switch back publishes the whole hidden
period in one go, retroactively, for anyone watching.

So there are two markers. `lastReadMessageId` keeps advancing whatever the setting says, because the
unread badge is the reader's own business and nobody else's. `lastSharedReadMessageId` — the one
every DTO and every broadcast actually reads — advances only while receipts are on. While they are
off the reader's position is never written anywhere a response could reveal it, and turning them
back on publishes nothing by itself: the shared marker is stale, and it catches up on the next thing
actually read. A receipt caused by an action, which is what a receipt is.

Turning them **off** also clears the shared markers that were already given, and broadcasts
`conversation:updated` to say so. A setting that leaves yesterday's "Seen" sitting on somebody's
screen has not done what its label says.

One asymmetry is honest about where it lives: the server guarantees your marker does not leave, and
the *fairness* half — that you do not get to read theirs — is enforced where the receipt is rendered.
It is a product rule rather than a confidentiality one, and pretending otherwise would mean
per-viewer copies of every room broadcast.

### Deleting an account: what goes, and the one decision that had to be made

Gone: the user row, and by cascade their participant rows, their reset tokens and their pending email
changes; their avatar file, which closes the "avatar files are not cleaned up" gap — nothing had ever
deleted a user, so nothing had ever been the right place to delete the file; and their live sockets,
which are already past the gate `requireAuth` re-checks.

**Their messages stay.** `Message.authorId` was `ON DELETE CASCADE`, which would have deleted every
message they ever wrote — gutting other people's conversations, and hard-deleting rows that
`lastReadMessageId` and the paging cursor point at with no foreign key to protect them. That is
precisely the pair of failures that made a message delete a tombstone in phase 8, and they do not get
weaker when the account rather than the message is what went. The relation is now `SET NULL`.

That forced the phase 7 check constraint open. It read `kind` and `authorId` as two spellings of one
fact — `USER` implied an author — and a message outliving its author breaks that. Only the SYSTEM
direction survives, which is the half that was ever load-bearing, and `kind` goes back to being the
discriminator its schema comment already said it was. One consequence had to be chased down by hand:
`countUnreadByConversation` excluded system messages by relying on `null <> $userId` being null, so
after this change it would have silently stopped counting the messages of everyone who ever left. It
filters on `kind` now.

**The name goes with the account, and that was a decision rather than a default.** The alternative —
copying the author's display name onto the message when it is written, the way the system log already
snapshots names — is a real design that other apps choose. It was rejected: holding on to the name of
somebody who has just asked to be erased is the opposite of what they asked for. An authorless USER
message renders as "Deleted account".

Attachments on those messages stay too, since the messages do. So account deletion does **not** close
the orphaned-attachment gap, whatever the plan said: that one is about files whose upload failed, and
it needs a sweep of the upload directory rather than a line in this service.

Every group they were in gets a `"X deleted their account"` line and, if they owned it, a new owner —
the database refuses a non-empty group with none, so the hand-over is not a nicety but the difference
between the delete working and failing. All of it commits with the user row, because half of this
having happened is a person who has left four groups and still has an account.

## Phase 14 — the four things that were actually broken — `done`

Not features. Everything here was already listed under Known gaps, and what they have in common is
that each one was a defect wearing a feature's clothes — the kind that gets deferred forever because
nobody is asking for it by name.

| # | Item | How it ended up |
| --- | --- | --- |
| 45 | Unread starts when you joined | One condition in `countUnreadByConversation`, bounded by `ConversationParticipant.joinedAt`. |
| 46 | Two test runs cannot corrupt each other | A session advisory lock held by `tests/global-setup.ts` for the whole run. |
| 47 | A Content-Security-Policy for the web app | `nginx.conf` became a template; the policy names the API's origin, derived once. |
| 48 | Orphaned attachment files are swept | `lib/orphaned-uploads.ts`, on the same shape as the outbox retention sweep. |

### Being added to a group was a badge with five years in it

A new participant's read marker is null, and the unread query reads a null marker as "has read
nothing" — true, and useless. Joining a group with history therefore lit the badge with all of it.

The bound is `joinedAt`, and it is applied to **everyone** rather than only to new joiners. That was
the thing the gap entry was worried about — "a second axis on unread math" — and it turned out to be
the opposite: one rule instead of two. For the people who were there from the start, `joinedAt` is
the moment the conversation was created, so nothing predates it and nothing changes for them. There
is a test that says so.

`>=`, not `>`. Both columns are millisecond timestamps written by the application, so a message sent
in the same millisecond as somebody joining is a real tie — constantly, in tests, where a fixture
creates a conversation and sends into it in one breath. Counting that message is the friendlier way
to be wrong.

### A test suite that could be corrupted by a second terminal

`tests/setup.ts` truncates every table before every test, so two runs against `chatty_test` deleted
each other's fixtures mid-test. It never looked like a collision: it looked like "user does not
exist" and "email already registered" scattered across unrelated files, which reads as a broken suite
rather than a busy database.

`global-setup.ts` now takes a PostgreSQL **session** advisory lock before it does anything else,
including the migration, and a second run refuses to start with a sentence that says what to do. A
session lock rather than a row or a lock file because it is released when the connection ends —
including on `ctrl-c`, and including on a crash. A lock that has to be cleaned up is a lock that
eventually strands the database in "busy" with nobody holding it.

It needs its own client with `connection_limit=1`. A pooled client is free to take the lock on one
connection and run the unlock on another, which would leave the lock held until the process exited.

### The CSP, and the two ways it could have been decorative

The API got Helmet in phase 11 and the web app got nothing, which was recorded as a gap rather than
half-done. It is the half that matters most for a chat app: every message is a string a stranger
typed. React escapes what it renders, so this is defence in depth — and the point of defence in depth
is the day something reaches `dangerouslySetInnerHTML`, or a dependency does it on this app's behalf.

Two things would have made the policy pointless, and both were found by running it rather than by
reading it:

- **`add_header` does not merge.** A `location` block that sets any header of its own discards every
  header inherited from the server block. Both locations here set a `Cache-Control`, so both would
  have silently served the fingerprinted JavaScript and `index.html` — the two files the policy is
  actually about — with no policy at all. The directive is held in one `set $csp` and re-added in
  each block.
- **`ws:` is not `http:`.** A CSP source expression matches by scheme, so a `connect-src` naming only
  the API's URL lets every fetch through and blocks the socket, which is the entire product. The
  WebSocket origin is derived from the HTTP one in a `.envsh` the nginx entrypoint sources, so there
  is one value to configure and no way to configure it inconsistently.

The `.envsh` has to be **executable** or the entrypoint skips it, logging a line nobody reads and
failing nothing — the container then dies on an unsubstituted variable. `COPY --chmod=0755`.

Verified against the built image rather than the config file: the header is present on `/`, on a
fingerprinted asset and on a client-side route, and a real Chromium loads the app under it with no
violations and no console errors. What is **not** verified end to end is the app talking to a live API
through the policy — that needs the full production stack — so `img-src` and `connect-src` are
argued from the header's contents rather than demonstrated.

### The half of the orphan gap that was actually closeable

`sendMessage` writes the file before the row, deliberately: the other order leaves a message pointing
at a picture that is not there. A request that dies in that window leaves a file nothing will ever
reference, and no amount of care inside the service can see it afterwards. So it is swept.

The grace period is the whole safety argument, and it is generous rather than tight. A file written
seconds ago may belong to a request that has not committed yet, and deleting *that* one turns a
working upload into a broken image — strictly worse than the bytes being reclaimed. An hour is far
past any live request.

No lock, on purpose. Two instances sweeping compute the same set and both call `rm --force`, which is
what makes deleting the same file twice a no-op; a lock would be a second thing to get right for an
operation that is already idempotent.

One thing this does **not** cover: avatar files. The same sweep is the right home for them and the
loop is now here, but it was left out rather than added quietly — see Known gaps.

## Phase 15 — contributor setup and focused settings — `done`

This phase starts with the path every contributor takes before it changes product behaviour. The
seed, test database and line endings must work on a fresh Windows or Unix clone; otherwise a green
change depends on undocumented local state. It then replaces the long account page with focused
settings categories inside a viewport-sized application shell.

| # | Item | Status |
| --- | --- | --- |
| 49 | Seed a group with an explicit owner | Done |
| 50 | Create `chatty_test` automatically on the first server test run | Done |
| 51 | Pin repository text files to LF across platforms | Done |
| 52 | Keep desktop Settings within the viewport and show one category at a time | Done |
| 53 | Add attachment lightbox and upload progress | Done |
| 54 | Sweep orphaned avatar files | Done |
| 55 | Search inside a conversation and jump to the exact message | Done |
| 56 | Add an edit window, edit history and per-user message deletion | Done |
| 57 | Add privacy-aware last-seen presence | Done |
| 58 | Move routing to a non-vulnerable supported release | Done |

The desktop shell owns the viewport. Conversation lists, message history and a settings category may
scroll independently when their content genuinely does not fit; the document itself should not grow
a second scrollbar. Small screens remain content-first and may scroll rather than clipping controls.

Message actions follow the interaction shared by Telegram, Zalo and Messenger rather than occupying
permanent space beside every bubble: a single overflow button appears on hover or keyboard focus and
opens a compact menu. Edit and delete-for-everyone disappear at the exact eight-hour server deadline;
delete-for-me remains available, including on a tombstone. Search is scoped to the open conversation,
uses a stable `(createdAt, id)` cursor, and returns an explicit `hasMore` rather than making the client
guess from page length.

## Phase 16 — one look, and settings that do not cost you the conversation — `done`

The app worked and looked like four people had styled it. This phase replaces the slate-and-blue
Tailwind defaults with a single declared design, and moves account settings off a full page and on
top of the chat. The design was drawn first, on a canvas, and the code follows it rather than the
other way round.

| # | Item | Status |
| --- | --- | --- |
| 59 | One palette and one type system, declared as tokens | Done |
| 60 | Settings as a dialog over the chat, with `/profile` still deep-linking | Done |
| 61 | Split `MessageList`, and give the thread a day rule | Done |
| 62 | Wordmark at the top of the sidebar, account at the bottom | Done |

### Item 59: ink on paper

Everything comes from `@theme` in `styles/globals.css`, so no component names a colour that is not
in the palette — an ivory sheet, near-black ink at three strengths, hairline rules, and **one**
colour. Vermilion marks exactly three things: an unread count, the conversation you are in, and
something you cannot undo. `--live` is the single exception, because presence is a different kind of
fact from a notification and giving them the same red made an online dot read as a demand.

Two rules carry most of the personality, and both are one line each:

- **Anything a machine produced is set in mono** — a timestamp, a handle, a count, an avatar's
  initials. Two custom utilities (`eyebrow`, `meta`) exist so that is five classes in one place
  rather than in forty files.
- **Icons are drawn like the rules on the page**: `svg { stroke-linecap: square; stroke-linejoin:
  miter }` in the base layer. lucide ships every icon with round joins, and a rounded tick beside a
  hairline border was the one thing that made early drafts look like a different app from the waist
  down.

**The fonts are self-hosted, and that was a CSP decision rather than a preference.**
`nginx.conf.template` sets `style-src 'self'; font-src 'self'`. A `<link>` to Google Fonts needs both
relaxed and adds a third-party runtime dependency to an app that has none anywhere else, so Archivo,
IBM Plex Mono and Instrument Serif come from `@fontsource/*` and Vite fingerprints them into the
bundle. Only the four weights the design uses: Archivo alone ships nine, and each one is a file
somebody downloads.

**The avatar is a rounded square with a tinted ground and a dark initial**, not a circle with white
text on a saturated fill. The tints are stored as *pairs* — a ground and an ink that is legible on it
— because the failure mode of hashing a name into a generated hue is that it eventually lands on
yellow. A group is ink-filled and carries the group's own initials rather than a generic icon, which
had made every group in a sidebar look like the same conversation. The presence mark is a square too,
so it never reads as a notification dot.

**The destructive button is outlined, not filled.** A solid red block invites the click it exists to
slow down.

### Item 60: settings, over the chat

Renaming yourself is twenty seconds of work, and paying for it with the conversation you were reading
is a bad trade. `SettingsModal` renders over `ChatPage`, and `app.tsx` composes the two as siblings on
the `/profile` route — the only place both are in scope, so `features/profile` still does not import
from `features/chat`. Closing is a `navigate("/chat")` rather than a piece of state, which is what
makes the browser's Back button close the dialog for free.

**`hooks/use-dialog.ts` is the first shared dialog primitive** — Escape, a focus trap, and focus moved
into the panel on open. It exists because the edit-history dialog and this one needed the identical
thing from different features, which is the case the frontend conventions say to lift into `src/hooks`
rather than copy. Two copies of a focus trap are two chances for one of them to lose a case.

The nav rows are renamed: "Password" rather than "Security", "Delete account" rather than "Danger
zone". Both old names described a *kind* of setting; a row is more useful when it names the thing it
will let you do. **`AVATAR_UPLOAD_HINT` says 5 MB, not the 2 MB on the design canvas** — the design was
guessing and `MAX_AVATAR_BYTES` is the thing that actually enforces it.

### Item 61: the message list, in four files

`MessageList` was one file holding the scroll container, the run-grouping, the read receipt, the
editor state, the bubble, the tombstone, the system line and the attachment. It is now the container
plus `MessageRow`, `SystemMessage` and `DaySeparator`, and what stayed in the container is exactly
what a row cannot answer on its own: where the day changes, where a run begins, which single message
the "Seen" marker sits on, and which one is open for editing.

**A bubble's bottom corner is cut to 2px on the side the message came from.** That notch, not the
fill, is what says who spoke — it survives a glance, a screenshot, and anyone who cannot tell the ink
block from the paper one by colour.

**The thread gained a day rule, and `formatMessageTime` lost its date.** It used to print `23/08 09:41`
on every bubble because a wall of bare times told you nothing about which day you were in. The rule
states the day once, above the first message of it, so keeping the date on the bubble underneath would
print it twice. `formatDayLabel` says "Today" and "Yesterday" rather than dating them, and drops the
year inside the current one.

**An incoming continuation shows its time on hover.** The design gives a run's later bubbles no line
of their own, which would take their timestamps with them; revealing it on hover keeps the tight
stacking and loses nothing. An *edited* one is shown outright — a marker saying "this is not what was
sent" must not need to be discovered.

**The actions menu now says how long is left.** Edit and delete-for-everyone expire eight hours after
sending, and before this they simply stopped being there one day, which reads as a bug rather than as
a rule. The countdown is derived from the server's own `authorActionExpiresAt` rather than from a copy
of the window on this side, so the client cannot disagree with the deadline that will be enforced.
The design's progress bar was dropped for exactly that reason: drawing a bar needs the *length* of the
window, which would mean a second copy of "eight hours" to drift from the server's.

### Item 62: the sidebar

The wordmark and the search go to the top; the account chip goes to the bottom, where an account lives
in every application shell people already use. It was in the header before, which put the thing you
touch least at the top of the thing you scan most.

Two things the rows gained, both because the design showed them and both real information the old
sidebar dropped:

- **A timestamp**, shorter the more recent it is — minutes, then a clock time, then "Yest.", then a
  weekday, then a date. Computed from whole calendar days rather than elapsed hours, or an hour of
  daylight saving would decide whether last night counted as yesterday.
- **A preview that is never blank.** A picture with no caption used to render an empty line, which
  reads as a conversation with nothing in it — the one thing it is definitely not. A tombstone now
  gets the sentence the thread shows rather than the empty string the server left behind.

**`ChatPage` was over the 300-line limit after this**, and the audit said so. `ConversationSidebar`
came out of it; every piece of state stayed in the page.

### What was on the canvas and is not in the code

Three, each for a stated reason rather than by omission:

- **The eight-hour progress bar** — see item 61. It needs a duplicate of a server constant.
- **A three-button hover strip beside each message.** Phase 15 decided on a single overflow button
  and a menu, deliberately, and matching Telegram/Zalo/Messenger is worth more than matching a mock.
- **"Read receipts" as its own settings row.** It is a checkbox on the profile form, where the other
  privacy setting already is; splitting one form into two to gain a nav row is not an improvement.

Also different from the canvas on purpose: the search placeholder says "Name, @handle or email"
rather than "Find someone by @handle", because `searchUsers` matches all three and a placeholder that
under-describes what works is the same class of lie as one that over-describes it.

## Known gaps not on the roadmap yet

- **Handle placement.** Asking for a handle during registration is friction. Alternatives discussed:
  auto-generate one and let the user change it later (Instagram-style), or move the field into
  onboarding. Deliberately deferred, not forgotten.
- **Every authenticated request now reads the user row.** The cost of closing the gap above:
  `verifyAccessToken` compares each token's `iat` against `passwordChangedAt`, so a JWT is no longer
  self-contained proof and both HTTP and the socket handshake hit the database. Correct, and the
  thing to remember before adding a per-request query of your own.
- **No production mail account is signed up for.** Mail sends for real over SMTP as of phase 10, and
  development runs against Mailpit, but a deployment still needs a provider, a verified sending
  domain, and SPF/DKIM/DMARC records — none of which are code, and without which mail is accepted by
  the provider and filed as spam by the recipient. That is the remaining distance, and it is
  paperwork rather than engineering.
- **Delivery is at-least-once.** A crash after the SMTP server accepted but before the row is marked
  sent still duplicates for any receiver that does not honour `Message-ID`. SMTP defines no
  idempotency key, so closing this properly means a provider API that does.
- **Nothing bounces back.** A hard bounce, a rejected recipient or a complaint is invisible here: the
  outbox records that the *server accepted* the message, which is not the same as it arriving.
  Handling that needs the provider's webhooks, which is the first thing that would justify leaving
  plain SMTP.
- **An attachment URL is bearer proof until it expires.** Copied out of the network tab it works
  anywhere for up to an hour, and someone removed from a group can still fetch an image whose token
  they were handed a minute earlier. Inherent to signed URLs rather than an oversight — see
  [ADR 0007](adr/0007-signed-attachment-urls.md) — and the TTL is the whole mitigation.
- **Search keeps diacritics.** `hen gap` does not find `hẹn gặp`. The fix is the `unaccent`
  extension plus an IMMUTABLE wrapper, written out in full in the phase 12 migration — deliberately
  not taken on, because it is a host-level dependency and the host is not chosen.
- **A deleted account's name is gone from its messages, and cannot be brought back.** The messages
  survive with `author` null and render as "Deleted account" (phase 13). Anyone who wants the history
  to keep reading as a conversation between named people would need a display-name snapshot on every
  message row, written at send time — which is a schema change and, more to the point, a different
  answer to what deletion means.
- **A read marker pointing outside the loaded page shows no "Seen".** Correct rather than wrong (the
  alternative is guessing), but it means a receipt can disappear when you scroll far enough back.
- **Typing is only shown for the conversation you have open.** The event arrives for every
  conversation you are in — `use-typing-participants` drops the rest on purpose, because a sidebar
  badge for something that expires in seconds is mostly flicker. Real messengers do show it there,
  so this is a judgement call rather than a settled answer.
- **The test suite still shares one upload directory across tests.** The database is truncated before
  each test and the filesystem is not, so a file written by one test survives into the next as a
  genuine orphan. Harmless for every suite except the sweep's own, which empties the directory
  itself — but it is the same class of problem the advisory lock closed for the database, one level
  down.
- **A system line does not follow a later rename.** "An added Binh" is stored as text when it
  happens, so it keeps the names people had at the time. Deliberate — see
  [ADR 0009](adr/0009-system-messages.md) — and recorded here so it is not "fixed" by accident. It is
  also the one thing localisation would change.
- **Nothing prunes system lines,** and nobody can delete one by hand either — the phase 8 check
  constraint makes them immutable on purpose (ADR 0009). A group with a lot of churn accumulates them
  in its history the same way it accumulates messages.
- **There is still no second admin and no demotion.** An owner can now hand the group to somebody
  else (phase 13), which is the half that was missing; what remains is that the role is a single seat
  rather than a set, so there is nobody to cover for an owner who has gone quiet without them acting
  first. See [ADR 0008](adr/0008-group-owner-role.md).
- **Any member can still add a stranger to a group.** Deliberate (inviting is how a group grows), and
  the owner can undo it. Every add is now named in the log, which is what makes that acceptable.

## Phase 17 — the grammar of a message cluster — `done`

Phase 16 gave the app one look. This phase is about the geometry *inside* it: what a run of messages
from one person is supposed to be, and the two things a message could not do yet.

| # | Item | Status |
| --- | --- | --- |
| 63 | Geist + Geist Mono, and a Vietnamese subset the old pair did not have | Done |
| 64 | Corner grammar: a run of messages is one shape, with one tail | Done |
| 65 | Message meta moves into the gutter, off the vertical | Done |
| 66 | Reactions | Done |
| 67 | Replies | Done |
| 68 | Quiet-time grouping and the mobile conversation flow | Done |

### Item 63: one superfamily, and diacritics that do not fall out of the font

Archivo and IBM Plex Mono were two unrelated designs, and every 10px label in the app was a seam
between them. Geist and Geist Mono are one family — the mono is the sans redrawn on a fixed pitch —
so a timestamp beside a sentence shares its skeleton rather than arguing with it.

The half that was a **bug**, not a preference: neither of the old faces ships a `vietnamese` subset,
so a display name or a message with diacritics fell back per glyph, mid-word. Both new faces carry
one. Instrument Serif still does not and is therefore never allowed to hold user text — it is the
wordmark and four fixed English headings, and that is now written down beside the import.

The paper lost about half its chroma at the same time. At the old value the background read as aged
newsprint, which dirtied every photograph posted on it.

### Items 64 and 65: a run of messages is one object

What shipped before put the same 2px notch on **every** bubble, so a burst of five messages showed
five tails stuttering down one edge and the notch stopped meaning "the turn ends here" — it meant
nothing, because it was everywhere.

The rule, in `constants/message-cluster.ts` as two tables: **the side away from the tail never
changes.** It stays at the full 10px for the whole height of the run, and that unbroken edge is what
makes five bubbles read as one turn. Only the tail side moves — a 4px seam where a bubble meets its
neighbour, and the 2px notch on the last one alone. The seam is 4px rather than 0 deliberately: a
squared-off join between two bubbles of the same fill reads as a clipping fault, and the eye stops
on it.

A picture inside a bubble follows the corners around it — each of its own is the bubble's *minus the
5px padding*, so 10 becomes 5 and both the seam and the notch collapse to 0. It was a flat
`rounded-[7px]` before, a number that matched neither the bubble it sat in nor anything else.

Four things close a run early, and each has a reason rather than a preference:

- **A reply** — it points somewhere else, so it is a new turn even from the same person.
- **A pause longer than five minutes** — adjacency is not continuity; two messages sent hours apart
  are separate turns even if nobody spoke between them. A same-day pause of an hour also gets one
  centred time marker so the reader is re-oriented without repeating the date.
- **A tombstone** — nothing was said, so there is no turn to continue. It also takes no notch at all.
- **A day rule or a system line**, as before.

A reaction deliberately does **not** close the run. Its row reserves the clearance under the bubble,
so a reaction landing between the second and third messages in a burst does not rewrite the corner
grammar and make one author look like they took two separate turns.

Item 65 is what made the ratio legible: every timestamp used to sit on its own line *under* its
bubble, which prised a burst of five messages apart into five separate-looking statements. The time,
the edited marker, the read receipt and the actions now sit in a gutter beside the bubble, on its
centreline. The gutter is laid out at full width and only *faded* in, so hovering a message reveals
its time without moving a pixel of the thread — and a run states its time once, at the end, rather
than printing the same minute four times.

The `⋯` lost its plate in the same pass. A white rounded chip beside a bubble reads as a second,
smaller message; the affordance is now carried by the glyph lifting from faint to full ink.

### Item 66: reactions

A closed set of five, stored as a Postgres enum and drawn from the icon set in ink. Not "any emoji",
for two reasons: a full-colour 😂 beside an ink bubble is the most saturated thing on a page that
spends its one colour on unread counts and things you cannot undo, and a free text column makes "the
same reaction" undecidable — U+2764 and U+2764 U+FE0F are two strings and one heart.

Three decisions worth keeping:

- **The composite primary key `(messageId, userId, kind)` is the toggle.** `deleteMany` reports how
  many rows it removed; zero means create one. The database decides, not a client that would
  disagree with itself across two tabs.
- **The DTO names everyone rather than counting.** `userIds`, not `count` plus `isMine` — the
  message is broadcast to the whole room as one payload, so anything answering "is this me?" would
  be answering it for whoever happened to trigger the write. The viewer holds their own id.
- **The chips hang off the edge *away* from the tail.** The tail side already carries the seams and
  the notch; a chip there would sit on the one corner that says where a turn ends. They overlap the
  bubble by exactly half, so a chip is unmistakably cut by the message it belongs to rather than
  floating between that message and the next.

Desktop keeps heart and reply as one-click hover actions; the overflow menu holds the other four
reaction kinds and the less frequent edit/delete actions. Reactions of one kind stay grouped in one
chip, and its hover title resolves the participant names instead of exposing only an unexplained
count.

A tombstone drops its reactions. The rows survive, but three hearts under "This message was deleted"
reads as approval of the deletion.

### Item 67: replies

A self-relation on `Message`, not a copy of the quoted text. A copy goes stale the moment the
original is edited and keeps showing words its author has since retracted — the two cases a quote
most needs to be honest about. The quote is resolved on every read, so an edited parent re-quotes
with its new text and a deleted one quotes as a tombstone.

The security half is a rule no foreign key can express: **the parent must be in the same
conversation.** A foreign key cannot say "and the same `conversationId`", so `sendMessage` checks it
inside the same transaction that writes the message, scoped by conversation rather than fetched and
compared — a miss is a miss whether the message is in another conversation or in none, which is also
what stops the check from confirming that an id exists somewhere the sender cannot see.

Visually the quote is a rule and two lines of type — no nested card, no fill, no second radius. It is
clamped to one line on purpose: it is a pointer, not a quotation, and three lines of somebody else's
message above a two-word answer inverts which of the two you are meant to read. An image reply adds a
small signed thumbnail in both the bubble quote and the composer, so "replying to a photo" remains
identifiable before and after the answer is sent.

### Item 68: quiet intervals and mobile navigation

The desktop shell keeps the conversation list and thread side by side. Below the medium breakpoint,
the same state becomes a two-screen flow: the list fills the viewport, choosing a conversation opens
the thread, and a labelled Back action returns to the list. Message meta moves below the bubble at
that width instead of permanently buying a horizontal gutter, and the thread has no horizontal
overflow at a 390px viewport.

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
