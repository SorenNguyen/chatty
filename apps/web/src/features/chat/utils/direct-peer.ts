import type { ConversationDTO, ParticipantDTO } from "@chatty/shared-types";

/**
 * The person on the other side of a 1-1 conversation.
 *
 * Null for a group, deliberately: a group has no single "other person", and
 * returning an arbitrary participant would let callers render one member's
 * avatar or online dot as if it stood for the whole thread.
 *
 * Also null in the degenerate case of a conversation containing only you, which
 * the server does not create but a stale client cache could still hold.
 */
export function getDirectPeer(conversation: ConversationDTO, currentUserId: string): ParticipantDTO | null {
	if (conversation.isGroup) return null;

	return conversation.participants.find((participant) => participant.id !== currentUserId) ?? null;
}
