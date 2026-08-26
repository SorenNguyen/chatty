import { z } from "zod";

export const createConversationSchema = z.object({
	// IDs of the other participant(s). A 1-1 chat has exactly one entry here;
	// a group chat has more than one, and the caller is added automatically.
	participantIds: z.array(z.string()).min(1),
	name: z.string().min(1).max(100).optional(), // required in practice once participantIds.length > 1
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const markReadSchema = z.object({
	// The newest message the caller has actually seen. A timestamp would be the
	// client's clock, which is not something the server should let decide what
	// counts as read.
	messageId: z.string().min(1),
});
export type MarkReadInput = z.infer<typeof markReadSchema>;

export const addParticipantSchema = z.object({
	userId: z.string().min(1),
});
export type AddParticipantInput = z.infer<typeof addParticipantSchema>;

export const renameConversationSchema = z.object({
	// Same bound as `createConversationSchema.name` — one group naming rule,
	// not two that could quietly drift apart.
	name: z.string().min(1).max(100),
});
export type RenameConversationInput = z.infer<typeof renameConversationSchema>;
