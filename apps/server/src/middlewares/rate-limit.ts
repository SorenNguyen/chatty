import type { Request } from "express";
import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import { env } from "../config/env.js";

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
 * Counters live in this process's memory. That is correct for a single server
 * and wrong the moment there are two: each would keep its own tally and the
 * effective limit would multiply. Moving to a shared store (Redis) is a
 * prerequisite for running more than one instance, not an optimisation.
 */
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
