-- Full-text search over message content.
--
-- A GENERATED column rather than a trigger, and that is the whole reason this is
-- cheap: PostgreSQL keeps it in step with `content` by construction, so there is
-- no backfill for existing rows, no trigger to forget on a new write path, and
-- no way for the index to disagree with the message it points at. Editing a
-- message (phase 8) updates it for free; deleting one empties `content`, so the
-- tombstone stops matching without anything being told to remove it.
--
-- 'simple', not 'english'. The english configuration stems and strips stop
-- words for one language, which is wrong for a chat app whose messages are
-- mostly Vietnamese: it would drop "a", "the", "is" as noise and mangle nothing
-- else usefully. 'simple' lowercases and splits on word boundaries, which is
-- exactly right for Vietnamese and merely unambitious for English — "running"
-- will not match "run".
--
-- Known limitation, deliberately left: 'simple' keeps diacritics, so searching
-- "hen gap" does not find "hẹn gặp". Closing that needs the `unaccent`
-- extension plus an IMMUTABLE wrapper around it (a generated column may only
-- call immutable functions, and `unaccent` is declared STABLE):
--
--     CREATE EXTENSION unaccent;
--     CREATE FUNCTION immutable_unaccent(text) RETURNS text
--       LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
--       AS $$ SELECT unaccent('unaccent', $1) $$;
--
-- That is a real fix and a real dependency: it needs an extension the host must
-- allow, and the IMMUTABLE claim is a promise that the unaccent rules never
-- change. Not taken on before the host is chosen.
ALTER TABLE "Message"
ADD COLUMN "searchVector" tsvector
GENERATED ALWAYS AS (to_tsvector('simple', "content")) STORED;

-- GIN, not GiST: this index is read far more often than it is written, and GIN
-- answers containment queries faster at the cost of a slower build.
CREATE INDEX "Message_searchVector_idx" ON "Message" USING GIN ("searchVector");
