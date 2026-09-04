import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { UnauthorizedError } from "../../lib/errors.js";
import { REFRESH_TOKEN_TTL_MS } from "./auth.sessions.js";
import {
	changePasswordSchema,
	confirmEmailChangeSchema,
	loginSchema,
	registerSchema,
	requestEmailChangeSchema,
	requestPasswordResetSchema,
	resetPasswordSchema,
} from "./auth.schema.js";
import * as authService from "./auth.service.js";

/**
 * Controllers stay thin: parse/validate input, call the service, send the
 * response. Validation errors thrown by `.parse()` are caught by the
 * `errorHandler` middleware (they're not try/caught here).
 */

/**
 * Name and shape of the cookie that carries the refresh token.
 *
 * `HttpOnly` so no script on the page can read it — the reason this migrated
 * off `localStorage`, where an XSS bug anywhere in the app could walk out with
 * a month-long credential. `path: "/auth"` scopes it to the two endpoints that
 * ever read one (`refresh`, `logout`) rather than attaching it to every request
 * this origin makes. `sameSite: "lax"` still crosses the web app's origin to
 * this API's: browsers scope "site" to the registrable domain, not the full
 * origin, so a different port in dev or a different subdomain in production is
 * still the same site and still gets the cookie on a plain fetch. A deployment
 * that puts the two on genuinely different domains needs `sameSite: "none"`
 * instead, which then requires `secure: true` even in that deployment's own dev.
 */
const REFRESH_TOKEN_COOKIE = "chatty_refresh_token";
const refreshTokenCookieOptions = {
	httpOnly: true,
	secure: env.NODE_ENV === "production",
	sameSite: "lax" as const,
	path: "/auth",
};

function setRefreshTokenCookie(res: Response, refreshToken: string): void {
	res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, { ...refreshTokenCookieOptions, maxAge: REFRESH_TOKEN_TTL_MS });
}

function clearRefreshTokenCookie(res: Response): void {
	res.clearCookie(REFRESH_TOKEN_COOKIE, refreshTokenCookieOptions);
}

/** Reads the credential `/auth/refresh` and `/auth/logout` act on. Never a body field — see the cookie's own comment. */
function readRefreshTokenCookie(req: Request): string {
	// Absent, not empty, is the only shape `cookie-parser` needs (it stops the
	// cast to `string`) — but any request to `path: "/auth"` without a cookie at
	// all has nothing to refresh or sign out, which is the same "not signed in"
	// answer as a fake token.
	const token = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_TOKEN_COOKIE];
	if (!token) throw new UnauthorizedError("No session to refresh");

	return token;
}

export async function registerController(req: Request, res: Response): Promise<void> {
	const input = registerSchema.parse(req.body);
	const result = await authService.register(input);
	setRefreshTokenCookie(res, result.refreshToken);
	res.status(201).json({ token: result.token, user: result.user });
}

export async function loginController(req: Request, res: Response): Promise<void> {
	const input = loginSchema.parse(req.body);
	const result = await authService.login(input);
	setRefreshTokenCookie(res, result.refreshToken);
	res.status(200).json({ token: result.token, user: result.user });
}

export async function changePasswordController(req: Request, res: Response): Promise<void> {
	const input = changePasswordSchema.parse(req.body);
	const result = await authService.changePassword(req.userId!, input);

	// A replacement token, because the request that changed the password also
	// invalidated the one it arrived with.
	setRefreshTokenCookie(res, result.refreshToken);
	res.status(200).json({ token: result.token });
}

/**
 * Trades a refresh token for a new pair.
 *
 * Unauthenticated on purpose: this is what a client calls precisely because its
 * access token has expired, so requiring one would make the endpoint useless at
 * the only moment it is needed. The refresh token is the credential, read from
 * the cookie rather than a body field it arrived alongside.
 */
export async function refreshSessionController(req: Request, res: Response): Promise<void> {
	const result = await authService.refreshSession(readRefreshTokenCookie(req));

	setRefreshTokenCookie(res, result.refreshToken);
	res.status(200).json({ token: result.token });
}

/**
 * Ends one session.
 *
 * 204 whether or not the token was real, and unauthenticated for the same
 * reason as refresh — a client whose access token has just expired must still
 * be able to sign out. Confirming that a token existed would tell somebody
 * holding a stolen one that it was worth having.
 */
export async function logoutController(req: Request, res: Response): Promise<void> {
	const cookies = req.cookies as Record<string, string | undefined> | undefined;
	const refreshToken = cookies?.[REFRESH_TOKEN_COOKIE];
	// Unlike `refreshSessionController`, a missing cookie is not an error here —
	// "already signed out" and "sign out" both end at the same 204.
	if (refreshToken) await authService.logout(refreshToken);

	clearRefreshTokenCookie(res);
	res.status(204).send();
}

export async function requestPasswordResetController(req: Request, res: Response): Promise<void> {
	const input = requestPasswordResetSchema.parse(req.body);
	await authService.requestPasswordReset(input);

	// 204 whether or not that address has an account. A 404 for unknown emails
	// would turn this endpoint into a membership check.
	res.status(204).send();
}

export async function resetPasswordController(req: Request, res: Response): Promise<void> {
	const input = resetPasswordSchema.parse(req.body);
	await authService.resetPassword(input);

	// No token: reading the mailbox proved the address, not the session. They
	// sign in with the new password like anyone else.
	res.status(204).send();
}

export async function requestEmailChangeController(req: Request, res: Response): Promise<void> {
	const input = requestEmailChangeSchema.parse(req.body);
	await authService.requestEmailChange(req.userId!, input);

	// 204, and the profile is deliberately not returned: nothing about the
	// account has changed yet, so a body echoing it back would suggest otherwise.
	res.status(204).send();
}

export async function confirmEmailChangeController(req: Request, res: Response): Promise<void> {
	const input = confirmEmailChangeSchema.parse(req.body);
	await authService.confirmEmailChange(input);

	// Also 204. The caller of this endpoint is a link opened in a mailbox and is
	// usually not signed in, so there is no session here to hand a profile to.
	res.status(204).send();
}
