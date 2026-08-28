-- A message can now be edited or deleted by the person who wrote it. Both are
-- recorded as timestamps on the row rather than as a DELETE: see the schema
-- comment on Message.deletedAt for the two places that point at a message id
-- without a foreign key and break when the row disappears.
ALTER TABLE "Message" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- "Deleted" has to mean the text is gone, not merely hidden. The service empties
-- `content` in the same statement that sets `deletedAt`; this is what makes that
-- a property of the data rather than a habit of one code path. A future endpoint
-- that forgets the redaction fails here instead of quietly serving the message
-- to anyone who queries the column directly.
ALTER TABLE "Message" ADD CONSTRAINT "Message_deleted_has_no_content"
CHECK ("deletedAt" IS NULL OR "content" = '');

-- A system line is not authored, so there is nobody who may change it: "An added
-- Binh" is the log of something that happened. Without this the only thing
-- stopping an edit is an authorization check in one service — and ADR 0009
-- already treats these lines as immutable history.
ALTER TABLE "Message" ADD CONSTRAINT "Message_system_is_immutable"
CHECK ("kind" = 'USER' OR ("editedAt" IS NULL AND "deletedAt" IS NULL));

-- Paging reads a conversation newest-first and tombstones stay in that order, so
-- the existing (conversationId, createdAt) index still serves the message list.
-- No new index: nothing queries by deletedAt.
