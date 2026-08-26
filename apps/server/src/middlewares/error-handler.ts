import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/**
 * Single place that turns a thrown error into an HTTP response. Route
 * handlers just `throw` — they don't know or care about status codes.
 * Must be registered last, after all routes, per Express convention.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
	if (err instanceof ZodError) {
		res.status(400).json({ error: "ValidationError", details: err.flatten() });
		return;
	}

	if (err instanceof AppError) {
		res.status(err.statusCode).json({ error: err.name, message: err.message });
		return;
	}

	logger.error({ err }, "Unhandled error");
	res.status(500).json({ error: "InternalServerError" });
};
