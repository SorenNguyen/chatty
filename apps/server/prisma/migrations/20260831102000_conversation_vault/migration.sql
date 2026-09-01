ALTER TABLE "Attachment"
  ADD COLUMN "hasThumbnail" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "MessageLink" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageLink_messageId_position_key" ON "MessageLink"("messageId", "position");
CREATE INDEX "MessageLink_conversationId_createdAt_idx" ON "MessageLink"("conversationId", "createdAt");
ALTER TABLE "MessageLink" ADD CONSTRAINT "MessageLink_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageLink" ADD CONSTRAINT "MessageLink_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"(id) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MessageStar" (
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageStar_pkey" PRIMARY KEY ("messageId", "userId")
);

CREATE INDEX "MessageStar_userId_createdAt_idx" ON "MessageStar"("userId", "createdAt");
ALTER TABLE "MessageStar" ADD CONSTRAINT "MessageStar_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageStar" ADD CONSTRAINT "MessageStar_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE;
