import { z } from "zod";

/** Ids are cuids; bounded so an unauthenticated route cannot be handed a novel. */
export const stickerParamsSchema = z.object({
	stickerId: z.string().min(1).max(64),
});
export type StickerParams = z.infer<typeof stickerParamsSchema>;

/** The signed token, in the query string because an `<img>` cannot send a header. */
export const stickerQuerySchema = z.object({
	token: z.string().min(1).max(512),
});
