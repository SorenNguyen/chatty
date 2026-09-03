import { z } from "zod";

/** Ids are cuids; bounded so a route parameter cannot be handed a novel. */
export const restrictionParamsSchema = z.object({
	userId: z.string().min(1).max(64),
});
export type RestrictionParams = z.infer<typeof restrictionParamsSchema>;

/** A privacy list must stay bounded just like every other user-controlled list. */
export const listRestrictedUsersQuerySchema = z.object({
	before: z.string().min(1).max(64).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ListRestrictedUsersQuery = z.infer<typeof listRestrictedUsersQuerySchema>;
