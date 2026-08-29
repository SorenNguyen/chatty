import { z } from "zod";

/**
 * What a search request may ask for.
 *
 * `query` has a minimum because an empty or one-character search matches an
 * enormous share of the table and is never what anyone meant — the client
 * debounces, and a stray keystroke should not become a full scan.
 */
export const searchMessagesQuerySchema = z
	.object({
		query: z.string().trim().min(2).max(200),
		limit: z.coerce.number().min(1).max(50).default(20),
		/** Limits results to one conversation; membership is still enforced by the join. */
		conversationId: z.string().cuid().optional(),
		/** The ordered pair is a stable cursor even when two messages share a timestamp. */
		before: z.string().datetime().optional(),
		beforeId: z.string().cuid().optional(),
	})
	.superRefine((query, context) => {
		if (Boolean(query.before) !== Boolean(query.beforeId)) {
			context.addIssue({
				code: "custom",
				message: "before and beforeId must be provided together",
				path: query.before ? ["beforeId"] : ["before"],
			});
		}
	});
export type SearchMessagesQuery = z.infer<typeof searchMessagesQuerySchema>;
