-- Reactions and replies.
--
-- Both are additive: every existing message keeps working with `replyToId` null
-- and no reaction rows, so this migration needs no backfill and no downtime.

CREATE TYPE "ReactionKind" AS ENUM ('HEART', 'THUMBS_UP', 'LAUGH', 'FROWN', 'ANGRY');

-- A reply points at another message. The "same conversation" half of the rule
-- cannot be a foreign key — it spans two columns of the parent row — so it is
-- enforced in sendMessage and tested there.
ALTER TABLE "Message" ADD COLUMN "replyToId" TEXT;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_replyToId_fkey"
  FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Serves the reply lookup in messageSelect, and stops a delete of a heavily
-- quoted message from sequentially scanning the table to null the pointers.
CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");

CREATE TABLE "MessageReaction" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ReactionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- The composite key is the toggle: the same person cannot leave the same
    -- kind on the same message twice, so "react again" is a delete and the
    -- database refuses the duplicate without the service checking first.
    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("messageId", "userId", "kind")
);

CREATE INDEX "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");

ALTER TABLE "MessageReaction"
  ADD CONSTRAINT "MessageReaction_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageReaction"
  ADD CONSTRAINT "MessageReaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
