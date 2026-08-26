import type { AuthResponse } from "@chatty/shared-types";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { ConflictError, UnauthorizedError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { JwtPayload } from "../../middlewares/require-auth.js";
import type { LoginInput, RegisterInput } from "./auth.schema.js";

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
