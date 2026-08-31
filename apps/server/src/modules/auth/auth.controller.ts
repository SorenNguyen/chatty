import type { Request, Response } from "express";
import {
	changePasswordSchema,
	confirmEmailChangeSchema,
	loginSchema,
	refreshTokenSchema,
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

export async function registerController(req: Request, res: Response): Promise<void> {
	const input = registerSchema.parse(req.body);
	const result = await authService.register(input);
	res.status(201).json(result);
}

export async function loginController(req: Request, res: Response): Promise<void> {
	const input = loginSchema.parse(req.body);
	const result = await authService.login(input);
	res.status(200).json(result);
}

export async function changePasswordController(req: Request, res: Response): Promise<void> {
	const input = changePasswordSchema.parse(req.body);
	const result = await authService.changePassword(req.userId!, input);

	// A replacement token, because the request that changed the password also
	// invalidated the one it arrived with.
	res.status(200).json(result);
}

/**
 * Trades a refresh token for a new pair.
 *
 * Unauthenticated on purpose: this is what a client calls precisely because its
 * access token has expired, so requiring one would make the endpoint useless at
 * the only moment it is needed. The refresh token in the body is the credential.
 */
export async function refreshSessionController(req: Request, res: Response): Promise<void> {
	const input = refreshTokenSchema.parse(req.body);
	const result = await authService.refreshSession(input.refreshToken);

	res.status(200).json(result);
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
	const input = refreshTokenSchema.parse(req.body);
	await authService.logout(input.refreshToken);

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
