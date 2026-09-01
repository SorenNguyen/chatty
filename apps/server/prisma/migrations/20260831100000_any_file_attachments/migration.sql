CREATE TYPE "AttachmentKind" AS ENUM ('IMAGE', 'FILE', 'AUDIO');

ALTER TABLE "Attachment"
  ADD COLUMN "conversationId" TEXT,
  ADD COLUMN "kind" "AttachmentKind" NOT NULL DEFAULT 'IMAGE',
  ADD COLUMN "mediaType" TEXT NOT NULL DEFAULT 'image/webp',
  ADD COLUMN "fileName" TEXT,
  ALTER COLUMN "width" DROP NOT NULL,
  ALTER COLUMN "height" DROP NOT NULL;

UPDATE "Attachment" attachment
SET "conversationId" = message."conversationId"
FROM "Message" message
WHERE attachment."messageId" = message.id;

ALTER TABLE "Attachment"
  ALTER COLUMN "conversationId" SET NOT NULL,
  ALTER COLUMN "mediaType" DROP DEFAULT,
  ADD CONSTRAINT "Attachment_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Attachment_image_has_dimensions"
    CHECK (("kind" <> 'IMAGE') OR ("width" IS NOT NULL AND "height" IS NOT NULL)),
  ADD CONSTRAINT "Attachment_file_has_name"
    CHECK (("kind" <> 'FILE') OR ("fileName" IS NOT NULL));

CREATE INDEX "Attachment_conversationId_kind_createdAt_idx"
  ON "Attachment"("conversationId", "kind", "createdAt");
