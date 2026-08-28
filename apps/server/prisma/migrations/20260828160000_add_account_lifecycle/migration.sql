-- Phase 13: the four things an account needs before real people have one —
-- changing its email, handing a group over, hiding read receipts, and deleting
-- the account entirely. One migration because the last of them is what forces
-- the constraint change the third and fourth both depend on.

-- ---------------------------------------------------------------------------
-- Changing your email
-- ---------------------------------------------------------------------------

-- The new address lives here and not on "User" until the link is opened: an
-- address nobody has proved they can read must never become a credential.
CREATE TABLE "EmailChangeToken" (
	"id" TEXT NOT NULL,
	"userId" TEXT NOT NULL,
	"newEmail" TEXT NOT NULL,
	"tokenHash" TEXT NOT NULL,
	"expiresAt" TIMESTAMP(3) NOT NULL,
	"usedAt" TIMESTAMP(3),
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "EmailChangeToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailChangeToken_tokenHash_key" ON "EmailChangeToken"("tokenHash");
CREATE INDEX "EmailChangeToken_userId_idx" ON "EmailChangeToken"("userId");

ALTER TABLE "EmailChangeToken"
ADD CONSTRAINT "EmailChangeToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deliberately no unique index on "newEmail". Two people may both ask for an
-- address neither of them owns; the first to open their link takes it and the
-- second fails at redemption against "User_email_key", which is the only index
-- that can answer the question at the moment it actually matters.

-- ---------------------------------------------------------------------------
-- Turning read receipts off
-- ---------------------------------------------------------------------------

ALTER TABLE "User" ADD COLUMN "readReceiptsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- The second marker: the one other people are allowed to see. It stops advancing
-- while its owner has receipts off, so their position is never written anywhere a
-- response could reveal it — and switching receipts back on therefore publishes
-- nothing about what they read in the meantime. See the schema comment.
ALTER TABLE "ConversationParticipant" ADD COLUMN "lastSharedReadMessageId" TEXT;

-- Everyone existing has receipts on, so what is already visible stays visible.
-- Without this backfill the feature would ship by silently un-seeing every
-- message in the database.
UPDATE "ConversationParticipant" SET "lastSharedReadMessageId" = "lastReadMessageId";

-- ---------------------------------------------------------------------------
-- Deleting your account
-- ---------------------------------------------------------------------------

-- Cascade would delete every message the departing user ever wrote. That guts
-- other people's conversations, and it hard-deletes rows that
-- "ConversationParticipant.lastReadMessageId" and the paging cursor point at
-- with no foreign key to protect them — the same two failures that made a
-- message delete a tombstone in phase 8.
ALTER TABLE "Message" DROP CONSTRAINT "Message_authorId_fkey";

ALTER TABLE "Message"
ADD CONSTRAINT "Message_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The phase 7 constraint read "kind" and "authorId" as two spellings of one
-- fact. A message that outlives its author breaks that: it is still a USER
-- message, and there is nobody left to point at. Only the SYSTEM direction
-- survives — a line nobody wrote must not claim an author — which is the half
-- that was ever load-bearing, and "kind" goes back to being the discriminator it
-- was declared as rather than a value inferable from a null.
ALTER TABLE "Message" DROP CONSTRAINT "Message_kind_author_consistency";

ALTER TABLE "Message"
ADD CONSTRAINT "Message_kind_author_consistency"
CHECK ("kind" = 'USER' OR "authorId" IS NULL);
