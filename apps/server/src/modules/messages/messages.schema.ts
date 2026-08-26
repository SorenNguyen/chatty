import { z } from "zod";

export const sendMessageSchema = z.object({
	content: z.string().min(1).max(4000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const listMessagesQuerySchema = z.object({
	// cursor-based pagination: pass the id of the oldest message you already
	// have to get the next page going further back
	before: z.string().optional(),
	limit: z.coerce.number().min(1).max(100).default(50),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
