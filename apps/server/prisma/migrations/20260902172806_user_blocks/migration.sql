-- One person refusing contact from another.
--
-- Prisma's draft of this migration opened with `DROP INDEX
-- "Message_searchVector_idx"` and a `DROP DEFAULT` on the generated
-- `searchVector` column, neither of which has anything to do with blocking. It
-- does that to every migration touching this schema, because `searchVector` is
-- `Unsupported("tsvector")` and the phase 12 GIN index is invisible to it. Both
-- lines were removed — see ADR 0015, and
-- `tests/search-index-survives-prisma.test.ts`, which exists to catch the day
-- somebody does not remove them.

CREATE TABLE "UserBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- "Does anyone block me?" is asked on every direct send, and asks from the
-- opposite side of the pair the unique index below serves.
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

-- Blocking twice is not an error the caller should have to think about, and this
-- is what lets the service express that as an upsert.
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");

-- Blocking yourself is not a state the application should have to render, and
-- the database is the only place that can promise it never happens. Same
-- reasoning as the phase 7 invariants: a rule the code checks is a rule until
-- somebody writes a second code path.
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_not_self" CHECK ("blockerId" <> "blockedId");

ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
