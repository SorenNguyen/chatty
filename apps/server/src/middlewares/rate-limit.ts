import type { Request } from "express";
import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { env } from "../config/env.js";
import { redis } from "../lib/redis.js";

/**
 * Rate limiters for the auth endpoints.
 *
 * These are not a nicety. `POST /auth/register` has to tell the caller when an
 * email is already taken — a user who cannot be told that cannot recover from
 * the error — which means the endpoint inherently reveals whether an address has
 * an account. Capping how often it can be called is what stops that from being
 * usable to enumerate a whole address list. `docs/conventions/backend.md` names
 * this as the mitigation; this file is it.
 *
 * Counters live in Redis when `REDIS_URL` is set, and in this process's memory
 * when it is not. The distinction is not cosmetic: in-memory counters are
 * correct for a single server and wrong the moment there are two, because each
 * keeps its own tally and the effective limit multiplies by the instance count.
 * The production compose file always sets `REDIS_URL`; local development
 * deliberately need not, so `npm run dev:server` starts with one container.
 */

/**
 * Prefix on every key, so a Redis shared with anything else — a cache, a queue,
 * a second copy of this app in staging — cannot collide with these counters or
 * be flushed along with them.
 */
const RATE_LIMIT_KEY_PREFIX = "chatty:rl:";

// Captured out of the nullable module export so the narrowing survives into the
// callback below — TypeScript cannot prove `redis` is still non-null by the time
// `sendCommand` runs, and it is right not to try.
const rateLimitClient = redis?.rateLimit ?? null;
function createAuthLimiter(options: {
	windowMs: number;
	limit: number;
	message: string;
	keyGenerator?: (request: Request) => string;
}): RateLimitRequestHandler {
	return rateLimit({
		windowMs: options.windowMs,
		limit: options.limit,
		...(options.keyGenerator ? { keyGenerator: options.keyGenerator } : {}),
		...(rateLimitClient
			? {
					store: new RedisStore({
						prefix: RATE_LIMIT_KEY_PREFIX,
						sendCommand: (...args: string[]) => rateLimitClient.sendCommand(args),
					}),
				}
			: {}),
		standardHeaders: "draft-7",
		legacyHeaders: false,
		// Tests run hundreds of registrations in seconds; a limiter would make
		// them fail for reasons that have nothing to do with what they assert.
		skip: () => env.NODE_ENV === "test",
		handler: (_request, response) => {
			response.status(429).json({ error: "TooManyRequests", message: options.message });
		},
	});
}

/**
 * Deliberately tighter than login: a person signs up once, so a legitimate user
 * never approaches this, while someone probing for registered addresses needs
 * volume to learn anything.
 */
export const registerRateLimiter = createAuthLimiter({
	windowMs: 60 * 60 * 1000,
	limit: 10,
	message: "Too many accounts created from this address. Try again later.",
});

/**
 * Looser, because typing a password wrong several times is normal. Still low
 * enough that guessing passwords at scale is impractical.
 */
export const loginRateLimiter = createAuthLimiter({
	windowMs: 15 * 60 * 1000,
	limit: 20,
	message: "Too many sign-in attempts. Try again later.",
});

/**
 * Caps `POST /auth/refresh`.
 *
 * Generous, because a legitimate client hits it every fifteen minutes per tab
 * and several tabs are normal — a limit that catches a busy user is a limit
 * that signs them out. Its job is to stop an unauthenticated endpoint that
 * hashes and writes being used as a free write loop, not to stop guessing:
 * guessing a 32-byte token is not a thing rate limiting is needed for.
 */
export const refreshRateLimiter = createAuthLimiter({
	windowMs: 15 * 60 * 1000,
	limit: 120,
	message: "Too many session refreshes. Try again later.",
});

/**
 * Caps attempts at `POST /auth/password`, which is a password guess with a
 * better prize than login: it is reached with a token someone may have picked
 * up from an unlocked screen, and getting it right rewrites the credential.
 *
 * Keyed by user id, not IP, and that is the point of the option existing.
 * `requireAuth` runs first, so every request counted here belongs to a known
 * account: an attacker cannot spend a victim's budget from elsewhere, and a
 * whole office behind one NAT does not share one.
 */
export const changePasswordRateLimiter = createAuthLimiter({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	message: "Too many password change attempts. Try again later.",
	// Non-null because this limiter is only ever mounted after requireAuth.
	keyGenerator: (request) => request.userId!,
});

/**
 * Caps `POST /auth/password-reset`.
 *
 * Not primarily an anti-guessing measure — there is nothing to guess. It stops
 * the endpoint being used as a free mail cannon: it sends an email to any
 * address someone names, and an uncapped one of those is how a domain's sending
 * reputation dies. Keyed by IP, because the caller is not signed in.
 */
export const passwordResetRequestRateLimiter = createAuthLimiter({
	windowMs: 60 * 60 * 1000,
	limit: 10,
	message: "Too many password reset requests. Try again later.",
});

/**
 * Caps `POST /auth/password-reset/confirm`.
 *
 * Here there *is* something to guess, even though 32 random bytes make it
 * hopeless. The limit costs a legitimate user nothing — they click a link once —
 * and removes the one endpoint that would otherwise accept unlimited attempts
 * at a credential.
 */
export const passwordResetConfirmRateLimiter = createAuthLimiter({
	windowMs: 15 * 60 * 1000,
	limit: 20,
	message: "Too many attempts. Try again later.",
});

/**
 * Caps `POST /auth/email`.
 *
 * The mail-cannon argument from the reset limiter, with a twist that makes it
 * worse rather than better: this endpoint sends to an address the caller types
 * in, and the copy says a Chatty account is moving to it. Uncapped, one account
 * is enough to spray a plausible-looking message across an address list.
 *
 * Keyed by user id like the password-change limiter, because `requireAuth` runs
 * first and the budget should belong to the account rather than to the office
 * everyone shares an IP with. Tighter than the reset limit: nobody changes their
 * address five times an hour.
 */
export const emailChangeRateLimiter = createAuthLimiter({
	windowMs: 60 * 60 * 1000,
	limit: 5,
	message: "Too many email change requests. Try again later.",
	// Non-null because this limiter is only ever mounted after requireAuth.
	keyGenerator: (request) => request.userId!,
});

/**
 * Caps `POST /auth/email/confirm`, the twin of the reset confirmation and capped
 * for the same reason: it is the one unauthenticated endpoint that accepts
 * guesses at a token, and a legitimate user reaches it once.
 */
export const emailChangeConfirmRateLimiter = createAuthLimiter({
	windowMs: 15 * 60 * 1000,
	limit: 20,
	message: "Too many attempts. Try again later.",
});
