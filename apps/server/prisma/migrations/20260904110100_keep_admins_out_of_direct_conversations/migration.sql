-- Extend the existing deferred aggregate invariant: a direct conversation has
-- no administration tier at all, so maintenance scripts cannot put ADMIN there
-- even though the application endpoints already reject it.
CREATE OR REPLACE FUNCTION "assert_conversation_owner_invariant"("targetConversationId" TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    "groupConversation" BOOLEAN;
    "participantCount" INTEGER;
    "ownerCount" INTEGER;
    "adminCount" INTEGER;
BEGIN
    SELECT "isGroup"
    INTO "groupConversation"
    FROM "Conversation"
    WHERE id = "targetConversationId";

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COUNT(*)::INTEGER,
           COUNT(*) FILTER (WHERE "role" = 'OWNER')::INTEGER,
           COUNT(*) FILTER (WHERE "role" = 'ADMIN')::INTEGER
    INTO "participantCount", "ownerCount", "adminCount"
    FROM "ConversationParticipant"
    WHERE "conversationId" = "targetConversationId";

    IF "groupConversation" AND "participantCount" > 0 AND "ownerCount" <> 1 THEN
        RAISE EXCEPTION 'non-empty group % must have exactly one owner', "targetConversationId"
            USING ERRCODE = '23514';
    END IF;

    IF NOT "groupConversation" AND ("ownerCount" <> 0 OR "adminCount" <> 0) THEN
        RAISE EXCEPTION 'direct conversation % cannot have an owner or admin', "targetConversationId"
            USING ERRCODE = '23514';
    END IF;
END;
$$;
