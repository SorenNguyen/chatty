import { createHash, randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { AuthResponse } from "@chatty/shared-types";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import type { JwtPayload } from "../../lib/access-token.js";
import { ConflictError, UnauthorizedError, ValidationError } from "../../lib/errors.js";
import { buildPasswordResetUrl, mailer } from "../../lib/mailer.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { getIO, userRoom } from "../../lib/socket-bus.js";
import type {
	ChangePasswordInput,
	LoginInput,
	RegisterInput,
	RequestPasswordResetInput,
	ResetPasswordInput,
} from "./auth.schema.js";

/**
 * Alias of the shared contract, so a change to what the client expects fails to
 * compile here rather than surfacing as a missing field at runtime.
 */
export type AuthResult = AuthResponse;

/**
 * Cost factor for bcrypt. Each +1 doubles the time to hash, which is the point:
 * slow hashing is what makes offline brute-forcing a stolen database impractical.
 * Do not drop below 10.
 */
const PASSWORD_HASH_ROUNDS = 12;

/**
 * A valid bcrypt hash of a random throwaway string — no password can ever match it.
 *
 * `login` compares against this when the email does not exist, so that a request for
 * an unknown email takes the same ~300ms as one for a known email with a wrong
 * password. Without it, an attacker can tell registered emails apart from unregistered
 * ones just by timing the responses, which defeats the point of returning an identical
 * error message for both cases.
 */
const DUMMY_PASSWORD_HASH = "$2b$12$BdIK5mgDr8tlgbVgbzNmmuH05p8K0StmWZesMIqpepw.d2ZtK3hdi";

/**
 * The fields safe to return to a client. `passwordHash` is deliberately absent:
 * selecting it and deleting it later leaves it one careless `res.json(user)` away
 * from being leaked.
 */
const PUBLIC_USER_FIELDS = { id: true, email: true, handle: true, displayName: true } as const;

/**
 * Signs the access token. The payload shape is read by BOTH `requireAuth`
 * (HTTP) and the Socket.io handshake in `sockets/index.ts` — changing `sub`
 * here without changing those two breaks authentication on both transports.
 */
function signAccessToken(userId: string): string {
	const payload: JwtPayload = { sub: userId };

	return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

/**
 * Creates an account and returns a token for it.
 *
 * Note this endpoint necessarily reveals whether an email is already registered —
 * a user who cannot be told "that email is taken" cannot recover from the error.
 * That is an accepted trade-off, not an oversight. The mitigation is the volume
 * cap in middlewares/rate-limit.ts (applied in auth.routes.ts), not vaguer errors.
 * `login` has no such excuse and stays opaque.
 */
export async function register(input: RegisterInput): Promise<AuthResult> {
	// Both uniques are checked in one query so the caller learns about a taken
	// handle and a taken email in the same round trip, rather than fixing one
	// and being told about the other.
	const conflicts = await prisma.user.findMany({
		where: { OR: [{ email: input.email }, { handle: input.handle }] },
		select: { email: true, handle: true },
	});

	if (conflicts.some((existing) => existing.email === input.email)) {
		throw new ConflictError("Email already registered");
	}

	if (conflicts.some((existing) => existing.handle === input.handle)) {
		throw new ConflictError("Handle already taken");
	}

	const passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);

	const user = await prisma.user.create({
		data: {
			email: input.email,
			// Already lowercased by handleSchema; the database index is
			// case-sensitive, so an un-normalised value here would let "Minh" and
			// "minh" both exist.
			handle: input.handle,
			displayName: input.displayName,
			passwordHash,
		},
		select: PUBLIC_USER_FIELDS,
	});

	return { token: signAccessToken(user.id), user };
}

/**
 * Verifies credentials and returns a token.
 *
 * Both failure modes — unknown email, wrong password — produce the identical
 * error, and take the same amount of time (see DUMMY_PASSWORD_HASH). Telling
 * them apart is what lets an attacker enumerate which emails have accounts.
 */
export async function login(input: LoginInput): Promise<AuthResult> {
	const user = await prisma.user.findUnique({
		where: { email: input.email },
		select: { ...PUBLIC_USER_FIELDS, passwordHash: true },
	});

	// Always run a comparison, even with no user, to keep the timing constant.
	const isPasswordCorrect = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

	if (!user || !isPasswordCorrect) throw new UnauthorizedError("Invalid email or password");

	// Built explicitly rather than by stripping `passwordHash` off `user`: an
	// allow-list cannot leak a field that gets added to the model later.
	return {
		token: signAccessToken(user.id),
		user: { id: user.id, email: user.email, handle: user.handle, displayName: user.displayName },
	};
}

/**
 * How long a reset link lives. Long enough to survive a slow inbox, short
 * enough that a link left in a mailbox is not a standing key to the account.
 */
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/**
 * The earliest a reset request may answer.
 *
 * An unknown email used to return after one lookup while a known one performed
 * three writes and sent mail. Status and copy were identical, but averaging
 * response times still answered the question the endpoint is meant to hide.
 * The rate limiter caps the cost of holding these requests open.
 */
const PASSWORD_RESET_RESPONSE_FLOOR_MS = 300;

/**
 * SHA-256, not bcrypt, and the difference is deliberate.
 *
 * bcrypt is slow on purpose because a password is low-entropy and guessable.
 * A reset token is 32 bytes from `randomBytes` — guessing it is already out of
 * reach, so the hash only needs to stop a leaked database from handing over
 * working links. bcrypt would also silently truncate at 72 bytes.
 */
function hashResetToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

async function waitForPasswordResetResponseFloor(startedAt: number): Promise<void> {
	const remainingMs = PASSWORD_RESET_RESPONSE_FLOOR_MS - (Date.now() - startedAt);
	if (remainingMs > 0) await delay(remainingMs);
}

function dispatchPasswordResetMail(recipient: string, token: string): void {
	// Delivery must not sit on the request path. A slow or failing provider only
	// runs for a real account, so awaiting it would turn latency or a 500 into an
	// account-enumeration oracle. The current console transport completes in this
	// process; a real deployment needs the durable outbox recorded in Known gaps.
	void Promise.resolve()
		.then(() =>
			mailer.send({
				to: recipient,
				subject: "Reset your Chatty password",
				body: [
					"Someone asked to reset the password on your Chatty account.",
					"",
					`Open this link within the hour to choose a new one:`,
					buildPasswordResetUrl(token),
					"",
					"If it was not you, nothing has changed and you can ignore this.",
				].join("\n"),
			}),
		)
		.catch((error: unknown) => logger.error({ err: error }, "password reset email delivery failed"));
}

/**
 * Marks every token this user holds as spent, and pushes their live sockets off.
 *
 * The token check in `lib/access-token.ts` refuses anything issued before
 * `passwordChangedAt`, which covers every future request. It does not cover a
 * WebSocket that authenticated an hour ago and has been open ever since — that
 * connection is already past the gate, so it has to be closed explicitly.
 */
function endSessions(userId: string): void {
	getIO().in(userRoom(userId)).disconnectSockets(true);
}

/**
 * Replaces the signed-in user's password, given the current one.
 *
 * Lives in the auth module rather than with the rest of the profile, because
 * this is the only other place that may hash a password. `PASSWORD_HASH_ROUNDS`
 * and the bcrypt call have one home; a second copy in the users service is how
 * the cost factor ends up different in two places.
 *
 * Unlike `login`, the failure message here is specific. Vague errors exist to
 * stop an attacker learning which emails have accounts, and the caller has
 * already proved they hold this account's token — there is nothing left to
 * enumerate, and "incorrect" is what a user needs to know to try again.
 *
 * **Every session ends, including the caller's**, which is why a fresh token
 * comes back. `passwordChangedAt` moves, so every token issued before now is
 * refused on its next request, and live sockets are disconnected. The caller
 * would be signed out of the tab they are looking at if they were not handed a
 * replacement; every other device is not, which is the entire point.
 */
export async function changePassword(userId: string, input: ChangePasswordInput): Promise<{ token: string }> {
	const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });

	// Reachable only if the account was deleted between the token being issued
	// and this request.
	if (!user) throw new UnauthorizedError("Invalid or expired token");

	const isCurrentPasswordCorrect = await bcrypt.compare(input.currentPassword, user.passwordHash);
	if (!isCurrentPasswordCorrect) throw new UnauthorizedError("Current password is incorrect");

	// Checked against the stored hash rather than against `currentPassword`, so
	// it still holds if the two were sent with different surrounding whitespace.
	const isSamePassword = await bcrypt.compare(input.newPassword, user.passwordHash);
	if (isSamePassword) throw new ValidationError("New password must be different from the current one");

	const passwordHash = await bcrypt.hash(input.newPassword, PASSWORD_HASH_ROUNDS);
	await prisma.user.update({
		where: { id: userId },
		data: { passwordHash, passwordChangedAt: new Date() },
		select: { id: true },
	});
	endSessions(userId);

	// Signed after `passwordChangedAt` was written, so its `iat` is not behind
	// the marker that would refuse it.
	return { token: signAccessToken(userId) };
}

/**
 * Starts a reset: mints a one-time link and dispatches its mail.
 *
 * **Returns nothing, and returns it whether or not the address exists.** This
 * endpoint is unauthenticated and takes an email, so any difference in what it
 * says — or in how long it takes to say it — is a way to ask "does this person
 * have an account". `register` has to reveal that and is rate limited instead;
 * this one has no such excuse.
 *
 * Outstanding links are burned first. Without that, someone who requested a
 * reset while they briefly had access to a mailbox keeps a live link after the
 * real owner requests their own — two valid keys, one of them forgotten about.
 */
export async function requestPasswordReset(input: RequestPasswordResetInput): Promise<void> {
	const startedAt = Date.now();
	const token = randomBytes(32).toString("base64url");

	try {
		const recipient = await prisma.$transaction(async (transaction) => {
			// The row lock serialises requests for the same account. Without it, two
			// requests can both burn the old set before either creates its replacement,
			// leaving two live links after both commits.
			const users = await transaction.$queryRaw<{ id: string; email: string }[]>`
				SELECT id, email
				FROM "User"
				WHERE email = ${input.email}
				FOR UPDATE
			`;
			const user = users[0];
			if (!user) return null;

			await transaction.passwordResetToken.updateMany({
				where: { userId: user.id, usedAt: null },
				data: { usedAt: new Date() },
			});

			await transaction.passwordResetToken.create({
				data: {
					userId: user.id,
					tokenHash: hashResetToken(token),
					expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
				},
				select: { id: true },
			});

			return user.email;
		});

		if (recipient) dispatchPasswordResetMail(recipient, token);
	} finally {
		// Applied on success and failure so the fast path cannot identify an
		// unknown address. A future network mailer must keep its own latency below
		// this bound or move delivery behind a durable queue.
		await waitForPasswordResetResponseFloor(startedAt);
	}
}

/**
 * Finishes a reset: sets the new password and spends the link.
 *
 * Expired, already used, and never existed all produce the same error, because
 * the caller is not signed in and telling them apart would say something about
 * an account to someone who has not proved they own it.
 *
 * The write is one transaction. Split, a crash between them either sets a
 * password while leaving the link live, or spends a link without setting
 * anything — the first is a spare key, the second locks the person out.
 */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
	const record = await prisma.passwordResetToken.findUnique({
		where: { tokenHash: hashResetToken(input.token) },
		select: { id: true, userId: true, expiresAt: true, usedAt: true },
	});

	if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
		throw new ValidationError("That reset link is invalid or has expired");
	}

	const passwordHash = await bcrypt.hash(input.newPassword, PASSWORD_HASH_ROUNDS);
	await prisma.$transaction(async (transaction) => {
		const claimedAt = new Date();
		// Validation above gives a useful fast failure. This conditional write is
		// the authority: two requests may both pass that read, but only one can
		// change a still-unused, still-live row and continue to the password write.
		const claimed = await transaction.passwordResetToken.updateMany({
			where: { id: record.id, usedAt: null, expiresAt: { gt: claimedAt } },
			data: { usedAt: claimedAt },
		});
		if (claimed.count !== 1) {
			throw new ValidationError("That reset link is invalid or has expired");
		}

		await transaction.user.update({
			where: { id: record.userId },
			data: { passwordHash, passwordChangedAt: claimedAt },
			select: { id: true },
		});
	});

	// No token is returned. Whoever is at the keyboard has proved they can read
	// the mailbox, which is not the same as having been signed in — they sign in
	// with the new password like anyone else.
	endSessions(record.userId);
}
