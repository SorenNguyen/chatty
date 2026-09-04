# ADR 0017: Durable local snapshots and idempotent message sends

**Status:** accepted

## Context

An optimistic bubble used to exist only in React memory. If the network dropped, it became a failed
draft that could be retried; if the tab then closed, the words and picked images disappeared. A
response could also disappear after PostgreSQL committed the message, leaving the client unable to
know whether retry meant “finish this send” or “send a second copy.”

Fast startup has the same failure mode. The server already returns a bounded, keyset-paged window,
but every reload first replaced it with an empty thread and waited for HTTP. An intermittent
connection therefore hid history the device had displayed moments earlier.

The launch architecture cannot require another managed service. The browser and PostgreSQL already
have the durable primitives needed for this stage.

## Decision

### IndexedDB is the device-side durable boundary

The browser stores four user-scoped records:

- the last authenticated current-user profile;
- active and archived sidebar snapshots;
- at most the bounded in-memory message window per opened conversation; and
- unsent text/image commands, including image bytes and their measured dimensions.

Startup paints the local snapshot, then lets an HTTP page replace it when the server answers. A
network failure keeps the local page rather than converting known history into an empty state. A
cached profile is accepted only when the request produced no HTTP response; a 401 or any other HTTP
failure still clears the session. Signing out or deleting the account clears that user's local data.
The production frontend registers a small same-origin service worker that caches only the app shell
and fingerprinted static assets; without the shell, IndexedDB alone could not make a cold offline
reload render anything. API responses and private media never enter that cache.

Signed attachment URLs are not durable data. They expire after an hour, so snapshots replace them
with local inert placeholders while retaining dimensions and metadata. A successful online refresh
supplies fresh URLs. Pending image sends are different: their actual bytes belong to the unsent
command and remain in IndexedDB until that command settles or the user discards it.

### The device id is a server-side idempotency key

`Message.clientId` stores the draft id against its author. PostgreSQL has a partial unique index on
`(authorId, clientId)` for non-null values, leaving system and legacy messages valid. Repeating the
same key in the same conversation returns the existing `MessageDTO` and emits no second socket
event. Reusing it in another conversation is rejected.

The service checks once before media work, then again after taking the existing conversation write
lock. The lock handles same-thread races; the unique index is the authority for cross-thread races.
If two requests prepared media before one discovers the winner, the losing request removes its
unreferenced files immediately and the existing orphan sweeper remains the crash fallback.

History pages omit `clientId`; it is returned only on the immediate response and room event. The
value is reconciliation metadata for the sending device, not part of the conversation's permanent
public DTO.

### Replay is at least once locally, exactly once logically

The client commits an outbox record before starting HTTP. On reload it reconstructs the optimistic
bubble and replays the same draft id. On reconnect it retries failed drafts. Either the socket event
or HTTP response may settle the draft and delete the outbox row; both operations are safe to repeat.

This is not a claim that one packet is delivered exactly once. Requests may run more than once.
What is guaranteed is that all successful executions with one author/client id converge on one
stored message and one broadcast.

## Consequences

- Recent text/history and unsent text/images survive reloads and intermittent connectivity without
  a service bill.
- Multiple tabs can race the same queued command without duplicating the message.
- IndexedDB is same-origin local data, not end-to-end encrypted storage. XSS prevention and clearing
  on sign-out remain part of its security boundary; ADR 0017 does not weaken the E2EE prerequisites
  in roadmap item 129.
- Previously downloaded media is not promised offline after its signed URL expires. Durable media
  caching needs an encrypted/cache-eviction design of its own and is not smuggled into a message
  snapshot.
- IndexedDB quota/private-mode failures degrade to the existing in-memory optimistic send. They do
  not block an online send, but a failed local write cannot promise survival across a tab close.
