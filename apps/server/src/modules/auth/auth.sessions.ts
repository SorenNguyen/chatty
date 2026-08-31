import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { UnauthorizedError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

/**
 * Refresh tokens: the half of a session that can actually be ended.
 *
 * Its own file rather than more of `auth.service.ts`, which is already the
 * longest module here, and because these five functions are one subject: they
 * are the only code that knows a session is a row.
 */

/**
 * How long a browser stays signed in without typing a password again.
 *
 * Thirty days rather than the seven the old access token had, and that is not a
 * relaxation: the seven days belonged to a token nothing could revoke, and this
 * one can be ended from the server the moment anybody asks. Trading an
 * unrevocable week for a revocable month is a straight improvement.
 */
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 32 bytes from the CSPRNG, the same size the password-reset link uses.
 *
 * Not a JWT. A JWT here would carry the same flaw the access token has — valid
 * because it says so — and the entire point of this row is that validity is
 * decided by the database.
 */
function mintToken(): string {
	return randomBytes(32).toString("base64url");
}

/**
 * SHA-256, not bcrypt, for the reason the reset token gives: the input is
 * already 32 random bytes, so there is nothing to brute-force and a slow hash
 * would only be a cost paid on every refresh.
 */
function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

/** Opens a session and returns the token to hand to the client. */
export async function issueRefreshToken(userId: string): Promise<string> {
	const token = mintToken();

	await prisma.refreshToken.create({
		data: {
			userId,
			tokenHash: hashToken(token),
			expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
		},
		select: { id: true },
	});

	return token;
}

/**
 * Spends a refresh token and opens its replacement, in one transaction.
 *
 * The claim is a **conditional update** rather than a read followed by a write,
 * the same shape the password reset uses: two requests arriving together would
 * otherwise both read `revokedAt IS NULL` and both mint a replacement, leaving
 * one session that has quietly become two. `updateMany` reports how many rows
 * it changed, and zero means somebody else won — or the token was already spent,
 * expired, or never existed, all of which are the same answer to the caller.
 *
 * Rotation is what limits the damage of a leaked refresh token: it works once,
 * and the real client's next refresh finds it spent.
 */
export async function rotateRefreshToken(token: string): Promise<{ userId: string; refreshToken: string }> {
	const tokenHash = hashToken(token);

	return prisma.$transaction(async (transaction) => {
		const now = new Date();
		const claimed = await transaction.refreshToken.updateMany({
			where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
			data: { revokedAt: now, lastUsedAt: now },
		});

		// Deliberately the same error as a made-up token. Telling a caller that
		// their token exists but is spent tells an attacker holding a stolen copy
		// that it was real, and that somebody beat them to it.
		if (claimed.count === 0) throw new UnauthorizedError("Invalid or expired session");

		const spent = await transaction.refreshToken.findUniqueOrThrow({
			where: { tokenHash },
			select: { userId: true },
		});

		const replacement = mintToken();
		await transaction.refreshToken.create({
			data: {
				userId: spent.userId,
				tokenHash: hashToken(replacement),
				expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
			},
			select: { id: true },
		});

		return { userId: spent.userId, refreshToken: replacement };
	});
}

/**
 * Ends one session — what "sign out" now actually does.
 *
 * Silent about whether the token existed, and it can afford to be: signing out
 * has nothing to report. A caller who presents somebody else's token learns
 * only that the request succeeded, which they knew.
 */
export async function revokeRefreshToken(token: string): Promise<void> {
	await prisma.refreshToken.updateMany({
		where: { tokenHash: hashToken(token), revokedAt: null },
		data: { revokedAt: new Date() },
	});
}

/**
 * Ends every session on an account: a password change, a reset, a delete.
 *
 * Takes an optional transaction client because two of its three callers run
 * inside one — a reset that revoked the sessions and then failed to write the
 * new password would have signed the owner out of an account whose password had
 * not changed.
 */
export async function revokeAllRefreshTokens(
	userId: string,
	client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
	await client.refreshToken.updateMany({
		where: { userId, revokedAt: null },
		data: { revokedAt: new Date() },
	});
}
