# ADR 0010: Serialize conversation writes and enforce group invariants in PostgreSQL

## Status

Accepted.

## Context

Phase 6 made a group transition more than one write. Removing an owner means deleting one
membership, writing a departure line, promoting a successor, writing an ownership line and moving
the conversation's timestamp. Adding and renaming also pair the visible state change with a system
message.

Those writes originally committed separately. A failure could therefore leave a member added with
no audit line, a renamed group with no record of the rename, or an owner removed before their
successor was promoted. Concurrency made the last case possible without any failure: if the owner
and longest-standing member left together, one request could select the other request's departing
member as successor and leave the final participant in an ownerless group.

Authorization had the same time-of-check/time-of-use gap. `sendMessage` checked membership before
its transaction, so a request that passed the check could wait behind a removal and then write after
that removal committed.

The application said every non-empty group had exactly one owner, but the database only guaranteed
one membership per user. A script or future code path could create two owners, no owner, or an owner
inside a direct conversation.

## Decision

**Every write that competes with group membership locks the `Conversation` row first.** Add, remove,
rename and send use an interactive Prisma transaction with `SELECT ... FOR UPDATE`, then re-check
authorization inside that transaction. PostgreSQL's default `READ COMMITTED` isolation plus one
shared lock order is sufficient; `SERIALIZABLE` would add retry handling without improving this
single-row protocol.

**A group action and its system messages are one database unit.** Membership/name changes, owner
transfer, system `Message` rows and `Conversation.updatedAt` either all commit or all roll back.
Socket room changes and events happen only after commit. Socket.IO cannot participate in a database
transaction: a process crash after commit can still lose a realtime event, but reload/reconnect reads
the correct durable state. Guaranteed delivery would require a transactional outbox.

**PostgreSQL enforces what Prisma's schema language cannot express.** Raw SQL migrations add:

- a partial unique index on `ConversationParticipant.conversationId WHERE role = OWNER`, proving at
  most one owner;
- a deferred constraint trigger, proving that a non-empty group has one owner at commit and a direct
  conversation has none;
- a check tying `Message.kind` to `authorId`: system messages have no author and user messages do.

The owner trigger is deferred because a valid hand-over briefly has zero owners between deleting the
old membership and promoting the successor. Existing rows are validated during migration rather
than assumed correct.

Message reads order by `createdAt` and then `id`. The secondary key makes the two system lines from
an owner departure deterministic when both receive the same millisecond timestamp.

## Consequences

- Writes to the same conversation are deliberately serial. They already update the same
  `Conversation.updatedAt` row, so this makes existing contention explicit rather than introducing a
  new shared resource. Different conversations remain independent.
- Authorization has a cheap pre-check where it prevents wasted attachment work, but the check after
  the lock is authoritative.
- Custom indexes and constraint triggers live in migration SQL because Prisma 5 cannot model them.
  The schema comment points to the migration so they are not mistaken for missing constraints.
- Database state can no longer partially commit when a system-message write fails. Socket effects
  can still fail after commit and are recoverable by reload, not rollback.
- Any future operation that changes membership, roles or conversation kind must join this lock and
  transaction protocol. A manual ownership-transfer endpoint is the most likely next one.
