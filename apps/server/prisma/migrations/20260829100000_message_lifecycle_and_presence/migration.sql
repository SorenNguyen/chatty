CREATE TYPE "PresenceVisibility" AS ENUM ('EVERYONE', 'CONTACTS', 'NOBODY');

ALTER TABLE "User"
ADD COLUMN "lastSeenAt" TIMESTAMP(3),
ADD COLUMN "presenceVisibility" "PresenceVisibility" NOT NULL DEFAULT 'CONTACTS';

CREATE TABLE "MessageEdit" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageEdit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageHiddenFor" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageHiddenFor_pkey" PRIMARY KEY ("messageId", "userId")
);

CREATE INDEX "MessageEdit_messageId_editedAt_idx" ON "MessageEdit"("messageId", "editedAt");
CREATE INDEX "MessageHiddenFor_userId_idx" ON "MessageHiddenFor"("userId");

ALTER TABLE "MessageEdit" ADD CONSTRAINT "MessageEdit_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageHiddenFor" ADD CONSTRAINT "MessageHiddenFor_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageHiddenFor" ADD CONSTRAINT "MessageHiddenFor_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
