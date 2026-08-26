import type { SendMessageRequest } from "@chatty/shared-types";
import { z } from "zod";

/**
 * `content` is optional because a message may be only an image. It cannot be
 * required-or-absent-depending-on-the-file here: the file arrives as
 * `req.file`, not in the body, and a body schema cannot see it. The controller
 * makes that call, at the same boundary.
 */
export const sendMessageSchema = z.object({
	content: z.string().max(4000).optional(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** Same compile-time contract check the auth schemas carry — see auth.schema.ts. */
type AssertAssignable<Actual extends Expected, Expected> = Actual;
export type SendMessageContract = AssertAssignable<SendMessageInput, SendMessageRequest>;

export const listMessagesQuerySchema = z.object({
	// cursor-based pagination: pass the id of the oldest message you already
	// have to get the next page going further back
	before: z.string().optional(),
	limit: z.coerce.number().min(1).max(100).default(50),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
