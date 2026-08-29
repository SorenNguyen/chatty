import type { EditMessageRequest, SendMessageRequest } from "@chatty/shared-types";
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

/**
 * `content` is required here where sending makes it optional, and the asymmetry
 * is the point: a send may carry only a file, an edit never carries one. The
 * emptiness rule still cannot live in this schema — whether "" is allowed
 * depends on the stored message having an image, which no body schema can see —
 * so the service decides it, the same way the controller decides it on send.
 */
export const editMessageSchema = z.object({
	content: z.string().max(4000),
});
export type EditMessageInput = z.infer<typeof editMessageSchema>;

export type EditMessageContract = AssertAssignable<EditMessageInput, EditMessageRequest>;

export const listMessagesQuerySchema = z
	.object({
		// cursor-based pagination: pass the id of the oldest message you already
		// have to get the next page going further back
		before: z.string().optional(),
		after: z.string().optional(),
		limit: z.coerce.number().min(1).max(100).default(50),
	})
	.refine((query) => !(query.before && query.after), { message: "Use either before or after, not both" });
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export const messageContextQuerySchema = z.object({
	limit: z.coerce.number().min(10).max(100).default(50),
});
export type MessageContextQuery = z.infer<typeof messageContextQuerySchema>;
