import { z } from "zod";

/**
 * What a search request may ask for.
 *
 * `query` has a minimum because an empty or one-character search matches an
 * enormous share of the table and is never what anyone meant — the client
 * debounces, and a stray keystroke should not become a full scan.
 */
export const searchMessagesQuerySchema = z.object({
	query: z.string().trim().min(2).max(200),
	limit: z.coerce.number().min(1).max(50).default(20),
	/**
	 * Cursor for the next page: the `createdAt` of the oldest result already
	 * held, as an ISO string.
	 *
	 * A timestamp rather than an id, unlike message paging. That cursor works
	 * because it walks one conversation in one index; results here are
	 * interleaved from many conversations, so there is no single row whose
	 * position the database can seek to — the ordering key is the cursor.
	 */
	before: z.string().datetime().optional(),
});
export type SearchMessagesQuery = z.infer<typeof searchMessagesQuerySchema>;
