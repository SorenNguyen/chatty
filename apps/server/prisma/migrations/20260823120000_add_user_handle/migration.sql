-- Adds User.handle: a unique, public identifier for finding people.
--
-- Written by hand rather than generated, because a unique NOT NULL column
-- cannot simply be added to a table that already has rows. The three steps
-- below are the safe order: add it nullable, fill it in, then tighten the
-- constraints. Doing it any other way fails on a non-empty table.

-- 1. Nullable first, so existing rows remain valid while we backfill.
ALTER TABLE "User" ADD COLUMN "handle" TEXT;

-- 2. Derive a handle from the email's local part: lowercased, with anything
--    outside [a-z0-9_] replaced. Two addresses can normalise to the same base
--    (minh@a.com and Minh@b.com), so collisions get a numeric suffix; the
--    oldest account keeps the clean handle.
WITH normalized AS (
    SELECT
        id,
        lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9_]', '_', 'g')) AS base,
        row_number() OVER (
            PARTITION BY lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9_]', '_', 'g'))
            ORDER BY "createdAt", id
        ) AS collision_index
    FROM "User"
)
UPDATE "User" u
SET "handle" = CASE
    WHEN n.collision_index = 1 THEN n.base
    ELSE n.base || n.collision_index::text
END
FROM normalized n
WHERE u.id = n.id;

-- 3. Now that every row has a value, enforce the real constraints.
ALTER TABLE "User" ALTER COLUMN "handle" SET NOT NULL;
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");
