-- Constraint triggers validate future writes, but they do not inspect rows
-- that existed before the trigger was installed. Refuse the migration if the
-- phase 6 backfill or a manual import left an invalid aggregate behind.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "Conversation" c
		LEFT JOIN "ConversationParticipant" p ON p."conversationId" = c.id
		GROUP BY c.id, c."isGroup"
		HAVING (
			c."isGroup"
			AND COUNT(p.id) > 0
			AND COUNT(p.id) FILTER (WHERE p."role" = 'OWNER') <> 1
		) OR (
			NOT c."isGroup"
			AND COUNT(p.id) FILTER (WHERE p."role" = 'OWNER') <> 0
		)
	) THEN
		RAISE EXCEPTION 'existing conversations violate the owner invariant'
			USING ERRCODE = '23514';
	END IF;
END;
$$;

-- Updating `updatedAt` for every message must not pay for an aggregate owner
-- check. Participant writes already carry their own trigger; this one only
-- covers the two operations that can change the parent side of the rule.
DROP TRIGGER "Conversation_kind_owner_invariant" ON "Conversation";

CREATE CONSTRAINT TRIGGER "Conversation_kind_owner_invariant"
AFTER INSERT OR UPDATE OF "isGroup" ON "Conversation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_conversation_kind_owner_invariant"();

-- `kind` is a discriminator, not a hint. Keeping this at the database boundary
-- prevents USER + null and SYSTEM + author combinations from reaching clients
-- that quite reasonably have no rendering path for either contradiction.
ALTER TABLE "Message"
ADD CONSTRAINT "Message_kind_author_consistency"
CHECK (
	("kind" = 'SYSTEM' AND "authorId" IS NULL)
	OR ("kind" = 'USER' AND "authorId" IS NOT NULL)
);
