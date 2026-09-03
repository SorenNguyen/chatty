-- One person holding another at arm's length, without refusing them.
--
-- Written by hand rather than generated, for the reason ADR 0015 gives and
-- `tests/search-index-survives-prisma.test.ts` enforces: Prisma opens every
-- migration touching this schema with `DROP INDEX "Message_searchVector_idx"`
-- and a `DROP DEFAULT` on the generated column, because `searchVector` is
-- `Unsupported("tsvector")` and the phase 12 GIN index is invisible to it.

CREATE TABLE "UserRestriction" (
    "id" TEXT NOT NULL,
    "restrictorId" TEXT NOT NULL,
    "restrictedId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRestriction_pkey" PRIMARY KEY ("id")
);

-- Restricting twice is the same request twice, and the unique index is what
-- lets the service say so in one upsert rather than a read-then-write that two
-- tabs could both pass. Same reasoning as "UserBlock".
CREATE UNIQUE INDEX "UserRestriction_restrictorId_restrictedId_key"
    ON "UserRestriction"("restrictorId", "restrictedId");

-- "Has this person restricted me?" is asked from the other side of the pair,
-- on the read-receipt and presence paths, and asks often.
CREATE INDEX "UserRestriction_restrictedId_restrictorId_idx"
    ON "UserRestriction"("restrictedId", "restrictorId");

-- The requests list and the settings list are descending keyset walks over one
-- person's own rows.
CREATE INDEX "UserRestriction_restrictorId_createdAt_id_idx"
    ON "UserRestriction"("restrictorId", "createdAt", "id");

-- Restricting yourself is not a state the application should have to render,
-- and the database is the only place that can promise it never happens — the
-- phase 7 principle, and the same constraint "UserBlock" carries.
ALTER TABLE "UserRestriction" ADD CONSTRAINT "UserRestriction_not_self" CHECK ("restrictorId" <> "restrictedId");

ALTER TABLE "UserRestriction" ADD CONSTRAINT "UserRestriction_restrictorId_fkey"
    FOREIGN KEY ("restrictorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRestriction" ADD CONSTRAINT "UserRestriction_restrictedId_fkey"
    FOREIGN KEY ("restrictedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
