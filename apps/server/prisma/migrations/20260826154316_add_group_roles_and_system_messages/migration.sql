-- CreateEnum
CREATE TYPE "ConversationRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('USER', 'SYSTEM');

-- AlterTable
ALTER TABLE "ConversationParticipant" ADD COLUMN     "role" "ConversationRole" NOT NULL DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "kind" "MessageKind" NOT NULL DEFAULT 'USER',
ALTER COLUMN "authorId" DROP NOT NULL;

-- Backfill: groups that already existed have no recorded creator, so the
-- longest-standing member becomes the owner. Without this every pre-existing
-- group is ownerless the moment the code starts enforcing the role — nobody
-- could rename it or remove anyone, and no path in the app would ever grant it.
-- Direct conversations are skipped on purpose: there is nothing to administer
-- between two people, and both rows stay MEMBER.
UPDATE "ConversationParticipant" p
SET "role" = 'OWNER'
FROM (
	SELECT DISTINCT ON (cp."conversationId") cp."id"
	FROM "ConversationParticipant" cp
	JOIN "Conversation" c ON c."id" = cp."conversationId"
	WHERE c."isGroup" = true
	ORDER BY cp."conversationId", cp."joinedAt" ASC, cp."id" ASC
) AS first_joined
WHERE p."id" = first_joined."id";
