import { PrismaClient } from "@prisma/client";
import { startDatabaseQuery } from "./metrics.js";

/**
 * A single shared Prisma client for the whole process. Prisma manages its
 * own connection pool internally — creating a new PrismaClient per request
 * would exhaust Postgres connections under load.
 */
export const prisma = new PrismaClient();

// Model and action come from Prisma's finite schema/API, never from a request,
// so these labels stay bounded. Timing at this boundary includes pool wait and
// database execution — exactly the latency a message command experiences.
prisma.$use(async (params, next) => {
	const stopTimer = startDatabaseQuery(params.model, params.action);

	try {
		const result = await next(params);
		stopTimer("success");

		return result;
	} catch (error) {
		stopTimer("error");
		throw error;
	}
});
