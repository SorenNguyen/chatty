import type { ConversationDTO } from "@chatty/shared-types";
import { getDirectPeer } from "./direct-peer";

/**
 * The name to show for a conversation.
 *
 * A 1-1 conversation has no stored name — it is titled by whoever you are
 * talking to, which differs per viewer, so it cannot be computed on the server.
 */
export function getConversationTitle(conversation: ConversationDTO, currentUserId: string): string {
	if (conversation.isGroup) return conversation.name ?? "Group";

	return getDirectPeer(conversation, currentUserId)?.displayName ?? "Unknown";
}
