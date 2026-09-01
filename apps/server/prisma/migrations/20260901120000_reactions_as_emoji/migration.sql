-- Reactions stop being a closed enum and become the emoji itself, and one person
-- stops being able to leave more than one on a message.
--
-- Two changes, one migration, because they are one decision. The old comment on
-- `enum ReactionKind` argued for the enum on two grounds, and exactly one of them
-- survives contact with what people expect a messenger to do:
--
--  - "The client draws each of these from the icon set in ink." It stopped: the
--    chips have rendered colour glyphs since phase 17 while the picker still
--    offered line icons, so one reaction had two appearances and neither
--    predicted the other.
--  - "A free column makes 'the same reaction' undecidable — U+2764 and
--    U+2764 U+FE0F are different strings and one heart." Still true, and it is
--    why this is not simply a `String`. `toggleReactionSchema` now admits only a
--    single fully-qualified RGI emoji (`\p{RGI_Emoji}` under the `v` flag), which
--    rejects the bare U+2764 at the boundary. One spelling reaches the column.
--
-- The key narrows from three columns to two because that is the rule every
-- messenger this was modelled on actually implements: you get one reaction per
-- message, and picking a second replaces the first. With an open emoji set the
-- old rule is not merely different, it is unbounded — one person could put forty
-- distinct chips under one sentence.

ALTER TABLE "MessageReaction" ADD COLUMN "emoji" VARCHAR(64);

-- The five that existed, in the spelling the picker will now offer. HEART maps
-- to the red heart rather than the purple one the chip used to draw: the quick
-- row is the familiar six, and a purple heart in the first slot is a different
-- reaction to anyone who has used another messenger.
UPDATE "MessageReaction" SET "emoji" = CASE "kind"
    WHEN 'HEART' THEN '❤️'
    WHEN 'THUMBS_UP' THEN '👍'
    WHEN 'LAUGH' THEN '😂'
    WHEN 'FROWN' THEN '😢'
    WHEN 'ANGRY' THEN '😡'
END;

ALTER TABLE "MessageReaction" ALTER COLUMN "emoji" SET NOT NULL;

-- Collapse anyone who left several on one message down to their most recent,
-- which is the closest thing the old data has to the choice they would make
-- under the new rule. `kind` breaks a tie on identical timestamps — Postgres
-- orders an enum by declaration, so this is deterministic rather than merely
-- arbitrary, which is what makes the migration repeatable.
DELETE FROM "MessageReaction" a
USING "MessageReaction" b
WHERE a."messageId" = b."messageId"
  AND a."userId" = b."userId"
  AND (a."createdAt" < b."createdAt" OR (a."createdAt" = b."createdAt" AND a."kind" < b."kind"));

-- Order matters: the key names the column being dropped, so it goes first and
-- comes back around the narrower pair.
ALTER TABLE "MessageReaction" DROP CONSTRAINT "MessageReaction_pkey";
ALTER TABLE "MessageReaction" DROP COLUMN "kind";
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("messageId", "userId");

-- Nothing else referenced it.
DROP TYPE "ReactionKind";
