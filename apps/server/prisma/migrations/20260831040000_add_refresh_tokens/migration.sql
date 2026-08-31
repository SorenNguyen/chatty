-- Revocable sessions.
--
-- Before this the session *was* a seven-day JWT in localStorage, which made
-- "sign out" a lie: it cleared the browser's copy and left every other copy
-- working for the rest of the week. A JWT cannot be taken back, so the fix is
-- not to change the JWT but to stop it being the session.
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- Unique because the hash is how a presented token is looked up: two rows with
-- the same hash would make "which session is this" ambiguous at exactly the
-- moment it must not be.
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- Revoking every session for one account is a query by user, and it runs on the
-- security path — a password change, a reset, a deleted account.
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- Cascade, unlike `Message.authorId`: a session carries no history worth
-- keeping without the account it belongs to, and nothing points at it.
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
