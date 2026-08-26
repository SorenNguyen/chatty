import type { Request, Response } from "express";
import { loginSchema, registerSchema } from "./auth.schema.js";
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
