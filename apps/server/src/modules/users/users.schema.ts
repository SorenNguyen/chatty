import { z } from "zod";

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
