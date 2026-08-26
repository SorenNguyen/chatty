import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/access-token.js";
import { UnauthorizedError } from "../lib/errors.js";

export type { JwtPayload } from "../lib/access-token.js";

/**
 * Verifies the `Authorization: Bearer <token>` header and attaches
 * `req.userId`.
 *
 * The check itself lives in `lib/access-token.ts`, shared with the Socket.io
 * handshake. It used to live here and be duplicated there, and the two drifted
 * — see that file.
 *
 * Asynchronous, because the shared check reads the database. Express 5 forwards
 * a rejected promise from a middleware to the error handler on its own, which is
 * the only reason this can throw rather than call `next(error)`.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
	const header = req.headers.authorization;
	if (!header?.startsWith("Bearer ")) {
		throw new UnauthorizedError("Missing bearer token");
	}

	req.userId = await verifyAccessToken(header.slice("Bearer ".length));
	next();
}
