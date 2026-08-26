import type { Request, Response } from "express";
import {
	changePasswordSchema,
	loginSchema,
	registerSchema,
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
