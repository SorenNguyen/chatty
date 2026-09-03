import { z } from "zod";

const pageFields = {
	before: z.string().min(1).max(64).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(40),
};

export const listMediaSchema = z.object({
	...pageFields,
	kind: z.enum(["image", "file", "audio"]),
});
export type ListMediaQuery = z.infer<typeof listMediaSchema>;

export const listLinksSchema = z.object(pageFields);
export type ListLinksQuery = z.infer<typeof listLinksSchema>;

export const listSavedSchema = z.object({
	...pageFields,
	/**
	 * Scopes the page to one conversation.
	 *
	 * The panel inside a chat wants only that chat's saved messages, and it used
	 * to get them by filtering the account-wide page in the browser — so somebody
	 * with forty saved messages elsewhere opened this tab on an empty list and had
	 * to scroll it into existence. Filtering belongs where the cursor is.
	 */
	conversationId: z.string().min(1).max(64).optional(),
});
export type ListSavedQuery = z.infer<typeof listSavedSchema>;
