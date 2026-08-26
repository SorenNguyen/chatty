/**
 * Typed errors a service throws. The error-handling middleware maps each
 * one to an HTTP status; callers never format an HTTP response themselves.
 */

export class AppError extends Error {
	constructor(
		message: string,
		public readonly statusCode: number,
	) {
		super(message);
		this.name = new.target.name;
	}
}

export class NotFoundError extends AppError {
	constructor(message = "Resource not found") {
		super(message, 404);
	}
}

export class ValidationError extends AppError {
	constructor(message = "Invalid input") {
		super(message, 400);
	}
}

/**
 * The caller is who they say they are and still may not do this.
 *
 * Distinct from `UnauthorizedError` (401, "sign in") and from `NotFoundError`
 * (404, "there is nothing here for you"): a group member who is not the owner
 * can see the group perfectly well, so hiding it behind a 404 would tell them
 * something they already know and leave the UI unable to say why the button
 * did nothing.
 */
export class ForbiddenError extends AppError {
	constructor(message = "Forbidden") {
		super(message, 403);
	}
}

export class UnauthorizedError extends AppError {
	constructor(message = "Unauthorized") {
		super(message, 401);
	}
}

export class ConflictError extends AppError {
	constructor(message = "Conflict") {
		super(message, 409);
	}
}
