import { z } from "zod";

/**
 * Params and query of the public `GET /attachments/:attachmentId`.
 *
 * Validated more carefully than most, because this is one of only two routes no
 * `requireAuth` runs before — nothing has looked at the request by the time it
 * arrives here.
 */
export const attachmentParamsSchema = z.object({
	attachmentId: z.string().min(1).max(64),
});
export type AttachmentParams = z.infer<typeof attachmentParamsSchema>;

export const attachmentQuerySchema = z.object({
	token: z.string().min(1).max(2048),
	size: z.enum(["thumb"]).optional(),
});
export type AttachmentQuery = z.infer<typeof attachmentQuerySchema>;
