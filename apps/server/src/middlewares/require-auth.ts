import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ATTACHMENT_TOKEN_TYPE } from "../lib/attachment-token.js";
import { UnauthorizedError } from "../lib/errors.js";

export interface JwtPayload {
	sub: string; // user id
}

/**
 * Verifies the `Authorization: Bearer <token>` header and attaches
 * `req.userId`. This is the one place JWT verification happens — the
 * shared secret is never re-derived elsewhere.
 *
 * The socket handshake (sockets/index.ts) does the equivalent check for
 * WebSocket connections; keep both in sync if the token shape changes.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
	const header = req.headers.authorization;
	if (!header?.startsWith("Bearer ")) {
		throw new UnauthorizedError("Missing bearer token");
	}

	const token = header.slice("Bearer ".length);

	try {
		const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload & { typ?: string };

		// Attachment URLs carry a token signed with the same secret, whose `sub` is
		// an attachment id rather than a user id. Without this check that token
		// would authenticate as a user who does not exist — the classic
		// token-confusion bug, and the reason the other kind is marked at all.
		if (payload.typ === ATTACHMENT_TOKEN_TYPE) {
			throw new UnauthorizedError("Invalid or expired token");
		}

		req.userId = payload.sub;
		next();
	} catch {
		throw new UnauthorizedError("Invalid or expired token");
	}
}
