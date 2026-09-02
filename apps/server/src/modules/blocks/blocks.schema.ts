import { z } from "zod";

/** Ids are cuids; bounded so a route parameter cannot be handed a novel. */
export const blockParamsSchema = z.object({
	userId: z.string().min(1).max(64),
});
export type BlockParams = z.infer<typeof blockParamsSchema>;
