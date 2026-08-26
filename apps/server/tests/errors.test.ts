import { describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "../src/lib/errors.js";

/**
 * Example test to show the pattern: test services/lib logic directly (no
 * HTTP involved), one behavior per `it`. As you implement modules/*.service.ts,
 * mirror this — e.g. `auth.service.test.ts` asserting `register()` throws
 * `ConflictError` when the email is already taken.
 */
describe("AppError subclasses", () => {
	it("NotFoundError defaults to a 404 status code", () => {
		expect(new NotFoundError().statusCode).toBe(404);
	});

	it("ValidationError defaults to a 400 status code", () => {
		expect(new ValidationError().statusCode).toBe(400);
	});

	it("carries a custom message through", () => {
		expect(new NotFoundError("conversation not found").message).toBe("conversation not found");
	});
});
