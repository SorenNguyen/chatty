-- Stickers: images somebody saved to send again with one tap.
--
-- A table of their own rather than a flag on `Attachment`, because the two have
-- different lifetimes. An attachment belongs to a message and is deleted with
-- it; a sticker outlives every message it was ever sent in. Sending one copies
-- its bytes into a fresh attachment for exactly that reason — deleting the
-- message must not empty the tray.
CREATE TABLE "Sticker" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sticker_pkey" PRIMARY KEY ("id")
);

-- The tray is always read as "mine, newest first".
CREATE INDEX "Sticker_userId_createdAt_idx" ON "Sticker"("userId", "createdAt");

-- Cascade, like a refresh token and unlike a message: a sticker carries no
-- history worth keeping without the person whose tray it was in.
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- What tells a sticker message from a photograph sent without a caption. The
-- two are the same shape and render nothing alike: a sticker is drawn bare and
-- large, a photo sits in a bubble.
ALTER TABLE "Message" ADD COLUMN "isSticker" BOOLEAN NOT NULL DEFAULT false;
