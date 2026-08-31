-- More than one image on a message.
--
-- Phase 4 wrote the limit down as deliberate and reversible: "Dropping the
-- unique later relaxes this without moving any data; going the other way would
-- not." This is that drop, and it is indeed data-free — every existing row
-- becomes the first image of its message.
--
-- The order is a stored column rather than `createdAt`, because a message's
-- images are written inside one transaction and share a timestamp to the
-- millisecond. Ordering by that would let a gallery shuffle itself between two
-- reads of the same message.
ALTER TABLE "Attachment" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- The unique that enforced one-image-per-message.
DROP INDEX "Attachment_messageId_key";

-- Unique on the pair, not dropped entirely: two images claiming slot 0 is an
-- ordering the database should refuse rather than one the reader discovers.
CREATE UNIQUE INDEX "Attachment_messageId_position_key" ON "Attachment"("messageId", "position");

-- The lookup the message mapper does on every page of messages. It came free
-- with the old unique index and has to be stated now that the unique leads with
-- a different column.
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

-- The default was only there to fill existing rows; every future insert states
-- its position, and leaving a default would let a second image silently land on
-- top of the first.
ALTER TABLE "Attachment" ALTER COLUMN "position" DROP DEFAULT;
