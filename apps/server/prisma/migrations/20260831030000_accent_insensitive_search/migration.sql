-- Accent-insensitive message search: "hen gap" finds "hẹn gặp".
--
-- The phase 12 migration wrote this fix out in full and deliberately did not
-- take it on, on the grounds that it "needs an extension the host must allow"
-- and the host was not chosen. That reasoning has expired rather than been
-- overturned: `unaccent` is a contrib module shipped inside the official
-- postgres image this project's own compose files run, and it is on the
-- allow-list of every managed Postgres this app could plausibly be deployed to.
-- What it costs is one line in the deployment checklist, which is written down
-- in DEPLOYMENT.md rather than discovered at the first search.
--
-- It matters more here than the English-language stemming this app does not do.
-- Vietnamese is written with diacritics and typed without them constantly — a
-- search that cannot cross that gap fails the people most likely to use it, on
-- most of what they look for.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- A generated column may only call IMMUTABLE functions, and `unaccent` is
-- declared STABLE, because the one-argument form picks its dictionary out of
-- the current `search_path` and could therefore answer differently in two
-- sessions.
--
-- The two-argument form names the dictionary outright, which removes exactly
-- that freedom and is what makes this wrapper's IMMUTABLE claim true rather
-- than merely asserted. What remains is a promise that the *contents* of the
-- unaccent dictionary never change; if that file is ever edited, the stored
-- vectors are stale and the column has to be rebuilt, the same way this
-- migration rebuilds it now.
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  AS $$ SELECT unaccent('unaccent', $1) $$;

-- Dropped and recreated rather than altered: PostgreSQL has no way to change
-- the expression behind a generated column in place. This rewrites the table
-- and rebuilds the index, which is the real cost of this migration and the
-- reason it is worth doing once rather than reaching for a trigger.
--
-- The index goes with the column, so it is recreated below rather than dropped
-- separately.
ALTER TABLE "Message" DROP COLUMN "searchVector";

ALTER TABLE "Message"
ADD COLUMN "searchVector" tsvector
GENERATED ALWAYS AS (to_tsvector('simple', immutable_unaccent("content"))) STORED;

-- GIN, not GiST, for the same reason as before: read far more often than
-- written, and GIN answers containment faster at the cost of a slower build.
CREATE INDEX "Message_searchVector_idx" ON "Message" USING GIN ("searchVector");
