import { createClient, type RedisClientType } from "redis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * The Redis connections, or nothing at all.
 *
 * Two things in this app keep state that must be shared once there is more than
 * one instance: rate-limit counters, and the Socket.io room registry. Both fall
 * back to process memory when `REDIS_URL` is unset — see `config/env.ts` for why
 * that is optional rather than required.
 *
 * Connected with a top-level await so that by the time any module reads
 * `rateLimitClient`, it is either usable or null. The alternative — handing a
 * not-yet-connected client to the rate limiter at import time — fails on the
 * first request rather than at boot, which is the wrong moment to find out.
 */

/**
 * Subscribing puts a connection into a mode where it may issue nothing else, so
 * the Socket.io adapter needs a dedicated pair and cannot borrow the one the
 * rate limiter uses.
 */
export interface RedisConnections {
	rateLimit: RedisClientType;
	pub: RedisClientType;
	sub: RedisClientType;
}

async function connectAll(url: string): Promise<RedisConnections> {
	const rateLimit: RedisClientType = createClient({ url });
	const pub: RedisClientType = createClient({ url });
	const sub: RedisClientType = pub.duplicate() as RedisClientType;

	for (const client of [rateLimit, pub, sub]) {
		// Without a listener, a dropped connection raises an unhandled 'error'
		// event, which takes the whole process down — node-redis reconnects on its
		// own, so logging is the correct response.
		client.on("error", (error: Error) => logger.error({ err: error }, "redis client error"));
	}

	await Promise.all([rateLimit.connect(), pub.connect(), sub.connect()]);

	return { rateLimit, pub, sub };
}

export const redis: RedisConnections | null = env.REDIS_URL ? await connectAll(env.REDIS_URL) : null;

if (!redis && env.NODE_ENV === "production") {
	// Not a throw: an instance without Redis still works correctly on its own,
	// and refusing to boot would turn a scaling misconfiguration into an outage.
	// It is loud because the failure it precedes is silent — two instances each
	// enforcing their own rate limit, and presence that only sees half the users.
	logger.warn(
		"REDIS_URL is not set. Rate-limit counters and socket rooms are per-process, so this instance cannot be run alongside another.",
	);
}
