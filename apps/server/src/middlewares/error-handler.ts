import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

interface JsonParseError extends SyntaxError {
	status: 400;
	type: "entity.parse.failed";
}

function isJsonParseError(error: unknown): error is JsonParseError {
	if (!(error instanceof SyntaxError)) return false;

	const candidate = error as Partial<JsonParseError>;
	return candidate.status === 400 && candidate.type === "entity.parse.failed";
}

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

	// express.json() rejects malformed input before a controller runs. Treat it
	// as a client error without reflecting parser details or the submitted body.
	if (isJsonParseError(err)) {
		res.status(400).json({ error: "BadRequest", message: "Malformed JSON body" });
		return;
	}

	if (err instanceof AppError) {
		res.status(err.statusCode).json({ error: err.name, message: err.message });
		return;
	}

	logger.error({ err }, "Unhandled error");
	res.status(500).json({ error: "InternalServerError" });
};
