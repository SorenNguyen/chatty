import type { EditMessageRequest, SendMessageRequest, ToggleReactionRequest } from "@chatty/shared-types";
import { z } from "zod";

/**
 * `content` is optional because a message may be only an image. It cannot be
 * required-or-absent-depending-on-the-file here: the file arrives as
 * `req.file`, not in the body, and a body schema cannot see it. The controller
 * makes that call, at the same boundary.
 */
export const sendMessageSchema = z.object({
	content: z.string().max(4000).optional(),
	// Validated as a string here and as a real message in the service: whether
	// this id names a message in *this* conversation is not something a body
	// schema can see, and it is the half that matters — see `sendMessage`.
	replyToId: z.string().min(1).optional(),
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

/**
 * The wire spelling of the reaction set, mirrored from `ReactionKind` in
 * shared-types. A `z.enum` rather than a plain string is what makes an unknown
 * kind a 400 at the boundary instead of a Prisma error four layers down.
 */
export const toggleReactionSchema = z.object({
	kind: z.enum(["heart", "thumbs-up", "laugh", "frown", "angry"]),
});
export type ToggleReactionInput = z.infer<typeof toggleReactionSchema>;

export type ToggleReactionContract = AssertAssignable<ToggleReactionInput, ToggleReactionRequest>;

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
