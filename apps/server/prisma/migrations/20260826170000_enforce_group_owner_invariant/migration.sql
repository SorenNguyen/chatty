-- At most one owner can exist even while a transaction is in progress. A
-- regular Prisma @@unique cannot express the OWNER-only predicate, so this
-- index deliberately lives in SQL.
CREATE UNIQUE INDEX "ConversationParticipant_one_owner_per_conversation"
ON "ConversationParticipant" ("conversationId")
WHERE "role" = 'OWNER';

-- The partial unique index proves "no more than one". This deferred constraint
-- proves the other half: a non-empty group has one owner, and a direct
-- conversation has none. Deferred matters because an owner hand-over briefly
-- has zero owners between DELETE and UPDATE inside an otherwise-valid
-- transaction.
CREATE FUNCTION "assert_conversation_owner_invariant"("targetConversationId" TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
	"groupConversation" BOOLEAN;
	"participantCount" INTEGER;
	"ownerCount" INTEGER;
BEGIN
	SELECT "isGroup"
	INTO "groupConversation"
	FROM "Conversation"
	WHERE id = "targetConversationId";

	-- Cascading participant deletes run after their conversation is already
	-- gone. There is no surviving aggregate to validate in that case.
	IF NOT FOUND THEN
		RETURN;
	END IF;

	SELECT COUNT(*)::INTEGER,
	       COUNT(*) FILTER (WHERE "role" = 'OWNER')::INTEGER
	INTO "participantCount", "ownerCount"
	FROM "ConversationParticipant"
	WHERE "conversationId" = "targetConversationId";

	IF "groupConversation" AND "participantCount" > 0 AND "ownerCount" <> 1 THEN
		RAISE EXCEPTION 'non-empty group % must have exactly one owner', "targetConversationId"
			USING ERRCODE = '23514';
	END IF;

	IF NOT "groupConversation" AND "ownerCount" <> 0 THEN
		RAISE EXCEPTION 'direct conversation % cannot have an owner', "targetConversationId"
			USING ERRCODE = '23514';
	END IF;
END;
$$;

CREATE FUNCTION "check_conversation_owner_invariant"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		PERFORM "assert_conversation_owner_invariant"(NEW."conversationId");
	ELSIF TG_OP = 'DELETE' THEN
		PERFORM "assert_conversation_owner_invariant"(OLD."conversationId");
	ELSE
		PERFORM "assert_conversation_owner_invariant"(OLD."conversationId");
		IF NEW."conversationId" <> OLD."conversationId" THEN
			PERFORM "assert_conversation_owner_invariant"(NEW."conversationId");
		END IF;
	END IF;

	RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ConversationParticipant_owner_invariant"
AFTER INSERT OR UPDATE OR DELETE ON "ConversationParticipant"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_conversation_owner_invariant"();

-- Participant triggers cannot see a later change to Conversation.isGroup, so
-- validate that side of the relationship as well. This also protects imports
-- and maintenance scripts even though the application never changes isGroup.
CREATE FUNCTION "check_conversation_kind_owner_invariant"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM "assert_conversation_owner_invariant"(NEW.id);
	RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "Conversation_kind_owner_invariant"
AFTER INSERT OR UPDATE ON "Conversation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_conversation_kind_owner_invariant"();
