ALTER TABLE "ConversationParticipant"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "pinnedAt" TIMESTAMP(3),
  ADD COLUMN "mutedUntil" TIMESTAMP(3);

CREATE INDEX "ConversationParticipant_userId_archivedAt_idx"
  ON "ConversationParticipant"("userId", "archivedAt");
