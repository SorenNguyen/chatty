import { logger } from "./logger.js";
import { prisma } from "./prisma.js";
import { redis } from "./redis.js";

/**
 * Whether this process can serve a request right now.
 *
 * Distinct from liveness, and the distinction is the point: liveness asks "is
 * this process stuck, should it be killed", readiness asks "should traffic go
 * here yet". Answering both with one endpoint means either a deploy that routes
 * to an instance with no database connection, or a database blip that gets every
 * instance restarted at once.
 */

export interface Readiness {
	ok: boolean;
	checks: {
		database: "ok" | "unreachable";
		/** `"not configured"` is a pass: Redis is optional by design — see config/env.ts. */
		redis: "ok" | "unreachable" | "not configured";
	};
}

export async function checkReadiness(): Promise<Readiness> {
	// `SELECT 1` rather than counting a table: this asks whether a connection can
	// be obtained and a round trip completed, and nothing about the data. A query
	// that touches a table would also fail while a migration holds a lock, which
	// is exactly when pulling an instance out of rotation helps least.
	const database = await prisma.$queryRaw`SELECT 1`
		.then(() => "ok" as const)
		.catch((error: unknown) => {
			logger.error({ err: error }, "readiness: database unreachable");

			return "unreachable" as const;
		});

	const redisStatus = !redis
		? ("not configured" as const)
		: await redis.rateLimit
				.ping()
				.then(() => "ok" as const)
				.catch((error: unknown) => {
					logger.error({ err: error }, "readiness: redis unreachable");

					return "unreachable" as const;
				});

	return {
		ok: database === "ok" && redisStatus !== "unreachable",
		checks: { database, redis: redisStatus },
	};
}
