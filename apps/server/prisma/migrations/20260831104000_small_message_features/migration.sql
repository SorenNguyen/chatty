ALTER TABLE "Message" ADD COLUMN "isForwarded" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "MessageMention" (
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageMention_pkey" PRIMARY KEY ("messageId", "userId")
);

CREATE INDEX "MessageMention_userId_createdAt_idx" ON "MessageMention"("userId", "createdAt");
ALTER TABLE "MessageMention" ADD CONSTRAINT "MessageMention_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageMention" ADD CONSTRAINT "MessageMention_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PinnedMessage" (
  "conversationId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "pinnedById" TEXT NOT NULL,
  "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PinnedMessage_pkey" PRIMARY KEY ("conversationId", "messageId")
);

CREATE INDEX "PinnedMessage_conversationId_pinnedAt_idx" ON "PinnedMessage"("conversationId", "pinnedAt");
ALTER TABLE "PinnedMessage" ADD CONSTRAINT "PinnedMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PinnedMessage" ADD CONSTRAINT "PinnedMessage_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PinnedMessage" ADD CONSTRAINT "PinnedMessage_pinnedById_fkey"
  FOREIGN KEY ("pinnedById") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE;
