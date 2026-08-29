# ADR 0012 — Message lifecycle and last-seen privacy

Status: accepted

## Decision

For eight hours after sending, an author may edit a message or delete it for everyone. The API
enforces that deadline and the message DTO publishes its exact expiry, so clients hide author-only
actions instead of offering a request that will be refused. Before each edit, the previous content
is appended to `MessageEdit`; participants can inspect that history. “Delete for everyone” remains
a tombstone, while “Delete for me” inserts `(messageId, userId)` into `MessageHiddenFor` and is not
time-limited. Every message read, search, sidebar-preview and unread-count query excludes those rows
for that viewer.

The last live socket leaving writes `User.lastSeenAt`. `presenceVisibility` is `EVERYONE`,
`CONTACTS`, or `NOBODY`; contact visibility means people who share a conversation. Live online
presence remains visible to current conversation contacts because it is operational state, while
the stored timestamp is filtered before it crosses the wire.

## Consequences

- Edit history is append-only and cannot silently lose an earlier version.
- Per-user deletion does not mutate the shared message or break cursors/read markers.
- Hiding a message affects search, ordinary pages, context pages, sidebar previews, unread counts,
  and all of the user's live tabs. A hidden newest message reveals the previous visible preview.
- Search pagination uses the ordered pair `(createdAt, id)`, so messages sharing a timestamp cannot
  fall through the boundary between pages.
- The two visibility tables add indexed lookups to message reads; the compound primary key makes
  repeated deletion idempotent.
- A disconnect racing account deletion is harmless: the presence writer treats a missing user as
  an already-finished lifecycle rather than an error.
