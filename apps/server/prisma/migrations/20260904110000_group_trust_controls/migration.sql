-- Optional administrators sit below the one owner and above ordinary members.
ALTER TYPE "ConversationRole" ADD VALUE 'ADMIN' BEFORE 'MEMBER';

CREATE TYPE "ConversationInvitePolicy" AS ENUM ('EVERYONE', 'MANAGERS');

-- Preserve the product's existing behaviour on every current group. The owner
-- can tighten this after the clients understand the field.
ALTER TABLE "Conversation"
    ADD COLUMN "invitePolicy" "ConversationInvitePolicy" NOT NULL DEFAULT 'EVERYONE';
