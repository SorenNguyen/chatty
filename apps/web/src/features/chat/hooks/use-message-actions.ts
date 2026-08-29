import type { MessageDTO, ReactionKind } from "@chatty/shared-types";
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { api } from "@/api/client";
import { useSocketEvent } from "./use-socket-event";

interface MessageActions {
	editMessage: (messageId: string, content: string) => void;
	deleteMessage: (messageId: string) => void;
	toggleReaction: (messageId: string, kind: ReactionKind) => void;
}

/**
 * Changing a message that is already on screen: the two writes, and the one
 * event that renders their result.
 *
 * The three belong together and nowhere else. Both writes deliberately ignore
 * what the request returns — the server broadcasts `message:updated` back to
 * everyone including the author, and the subscription below is what puts it on
 * screen. Applying the response here as well would render the same change twice
 * by two routes, which is exactly what `MessageInput` avoids on a send.
 *
 * Takes the page's `setMessages` rather than owning the list: paging and arrival
 * still live in the page, and two sources of truth for one array is worse than
 * one setter passed down.
 */
export function useMessageActions(
	conversationId: string | null,
	setMessages: Dispatch<SetStateAction<MessageDTO[]>>,
	onConversationsChanged: () => void,
): MessageActions {
	useSocketEvent(
		"message:updated",
		useCallback(
			(message: MessageDTO) => {
				if (message.conversationId === conversationId) {
					// Replaced by id, never appended: this is a message already in the
					// conversation. One that has scrolled out of the loaded page simply
					// matches nothing, which is correct — it will arrive in its new
					// state whenever that page is fetched again.
					setMessages((current) =>
						current.map((existing) => (existing.id === message.id ? message : existing)),
					);
				}

				// For the sidebar preview only. The server deliberately does not bump
				// `updatedAt` for an edit, so this re-read cannot reorder the list —
				// editing something from last week must not raise that thread to the
				// top with nothing new in it.
				onConversationsChanged();
			},
			[conversationId, setMessages, onConversationsChanged],
		),
	);

	const editMessage = useCallback(
		(messageId: string, content: string) => {
			if (!conversationId) return;

			void api.editMessage(conversationId, messageId, content);
		},
		[conversationId],
	);

	const deleteMessage = useCallback(
		(messageId: string) => {
			if (!conversationId) return;

			void api.deleteMessage(conversationId, messageId);
		},
		[conversationId],
	);

	// Same shape as the two above, and for the same reason: the server broadcasts
	// `message:updated` carrying the whole reaction list, so this fires and waits
	// for nothing. Applying an optimistic count here as well would render the
	// change twice and drift the moment two people react at once.
	const toggleReaction = useCallback(
		(messageId: string, kind: ReactionKind) => {
			if (!conversationId) return;

			void api.toggleReaction(conversationId, messageId, kind);
		},
		[conversationId],
	);

	return { editMessage, deleteMessage, toggleReaction };
}
