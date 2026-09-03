-- Lookup from either direction is on the direct-message critical path. The
-- unique key already serves blocker -> blocked; this composite index serves the
-- reverse direction without scanning every person a target has ever blocked.
DROP INDEX "UserBlock_blockedId_idx";
CREATE INDEX "UserBlock_blockedId_blockerId_idx" ON "UserBlock"("blockedId", "blockerId");

-- The privacy settings use a descending keyset cursor, not OFFSET. PostgreSQL
-- walks a btree backwards once `blockerId` is fixed, so the normal Prisma index
-- shape still keeps that path a bounded index walk.
CREATE INDEX "UserBlock_blockerId_createdAt_id_idx" ON "UserBlock"("blockerId", "createdAt", "id");
