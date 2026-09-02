-- Every timestamp becomes an instant (`timestamptz`) instead of a naive wall clock.
--
-- The columns were `timestamp without time zone`, which stores no offset, so what
-- an instant meant depended on who wrote it. The database's own clock wrote local
-- time (`CURRENT_TIMESTAMP` narrowed to `timestamp` yields the session's wall
-- clock) while Prisma wrote UTC, and the two conventions sat in the same column.
-- On a UTC database they coincide, which is why this survived: docker-compose
-- pins nothing, and the postgres image happens to default to UTC. Point the same
-- code at a database in Asia/Ho_Chi_Minh and the outbox's `"nextAttemptAt" <=
-- NOW()` reads a five-minute backoff as seven hours overdue, and the keyset
-- pagination in the vault and search compares a UTC parameter against a local
-- value and hands out the cursor row twice.
--
-- `AT TIME ZONE 'UTC'` in each USING clause is the load-bearing part. Without it
-- the conversion reads existing values in the *session's* timezone, so running
-- this migration from a non-UTC client would shift every historical row. Every
-- deployment so far has run UTC, so UTC is what the stored values mean.

ALTER TABLE "Attachment"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "Conversation"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "ConversationParticipant"
  ALTER COLUMN "joinedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "joinedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "archivedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "archivedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "pinnedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "pinnedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "mutedUntil" SET DATA TYPE TIMESTAMPTZ(3) USING "mutedUntil" AT TIME ZONE 'UTC';

ALTER TABLE "EmailChangeToken"
  ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "usedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "usedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- `searchVector` is deliberately untouched. Prisma models it as
-- `Unsupported("tsvector")` and does not know it is GENERATED ALWAYS, so its
-- draft of this migration tried to `DROP DEFAULT` on it (rejected outright) and
-- to drop the GIN index from phase 12 that it cannot see. Neither belongs here.
ALTER TABLE "Message"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "editedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "editedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "deletedAt" AT TIME ZONE 'UTC';

ALTER TABLE "MessageEdit"
  ALTER COLUMN "editedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "editedAt" AT TIME ZONE 'UTC';

ALTER TABLE "MessageHiddenFor"
  ALTER COLUMN "hiddenAt" SET DATA TYPE TIMESTAMPTZ(3) USING "hiddenAt" AT TIME ZONE 'UTC';

ALTER TABLE "MessageLink"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "MessageMention"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "MessageReaction"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "MessageStar"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- The default is re-stated because narrowing it to a naive column was half the
-- bug: `CURRENT_TIMESTAMP` is an instant, and the column can now hold one.
ALTER TABLE "OutboxMessage"
  ALTER COLUMN "nextAttemptAt" SET DATA TYPE TIMESTAMPTZ(3) USING "nextAttemptAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "nextAttemptAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "sentAt" SET DATA TYPE TIMESTAMPTZ(3) USING "sentAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "PasswordResetToken"
  ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "usedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "usedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "PinnedMessage"
  ALTER COLUMN "pinnedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "pinnedAt" AT TIME ZONE 'UTC';

ALTER TABLE "RefreshToken"
  ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "revokedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "revokedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "lastUsedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "lastUsedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "Sticker"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "User"
  ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "avatarUpdatedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "avatarUpdatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "passwordChangedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "passwordChangedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "lastSeenAt" SET DATA TYPE TIMESTAMPTZ(3) USING "lastSeenAt" AT TIME ZONE 'UTC';
