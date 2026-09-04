-- A device-generated id turns an offline retry into the same logical send.
-- Nullable keeps every existing/system message valid. PostgreSQL's partial
-- unique index gives user messages exactly-once identity without pretending
-- null is an identity for legacy rows.
ALTER TABLE "Message" ADD COLUMN "clientId" VARCHAR(64);

CREATE UNIQUE INDEX "Message_authorId_clientId_key"
    ON "Message"("authorId", "clientId")
    WHERE "authorId" IS NOT NULL AND "clientId" IS NOT NULL;

-- Prisma cannot describe a partial unique index. This ordinary index mirrors
-- the schema and keeps lookup planning stable if the partial index ever changes.
CREATE INDEX "Message_authorId_clientId_idx" ON "Message"("authorId", "clientId");
