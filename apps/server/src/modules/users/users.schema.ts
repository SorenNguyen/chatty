import type { UpdateProfileRequest } from "@chatty/shared-types";
import { z } from "zod";
// Imported rather than re-declared. These rules already exist because
// registration needs them, and a profile edit that validated a handle
// differently from a signup would let a value in that could never have been
// registered — two copies of a rule are two chances for one to drift.
import { displayNameSchema, handleSchema } from "../auth/auth.schema.js";

export const searchUsersQuerySchema = z.object({
	// At least one character on purpose: an empty query would dump the whole
	// user table to anyone with an account.
	query: z.string().min(1).max(64),
	limit: z.coerce.number().min(1).max(50).default(20),
});
export type SearchUsersQuery = z.infer<typeof searchUsersQuerySchema>;

/**
 * Params of the public `GET /users/:userId/avatar`.
 *
 * Validated even though the value only ever reaches a database lookup and a
 * path join, because it is the one route on this router that no `requireAuth`
 * runs before — nothing else has looked at the request by the time it arrives.
 */
export const avatarParamsSchema = z.object({
	userId: z.string().min(1).max(64),
});
export type AvatarParams = z.infer<typeof avatarParamsSchema>;

/**
 * Body of `PATCH /users/me`.
 *
 * `.partial()` is not enough on its own: it would accept `{}`, which reaches the
 * service, updates nothing and answers 200 as though something happened. The
 * refine turns that into a 400 that says what was missing.
 *
 * `email` is absent on purpose — changing it means proving the new address is
 * reachable, which needs the outbound email that phase 3 item 10 is waiting on.
 */
export const updateProfileSchema = z
	.object({
		displayName: displayNameSchema,
		handle: handleSchema,
	})
	.partial()
	.refine((input) => input.displayName !== undefined || input.handle !== undefined, {
		message: "Provide displayName or handle",
	});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Same compile-time contract check the auth schemas carry — see auth.schema.ts. */
type AssertAssignable<Actual extends Expected, Expected> = Actual;
export type UpdateProfileContract = AssertAssignable<UpdateProfileInput, UpdateProfileRequest>;
