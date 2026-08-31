import type {
	ConversationDTO,
	ConversationLeftEvent,
	ConversationReadEvent,
	ConversationUpdatedEvent,
} from "@chatty/shared-types";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { usePresenceLastSeenSync } from "./use-presence-last-seen-sync";
import { useSocketEvent } from "./use-socket-event";

interface ConversationList {
	conversations: ConversationDTO[];
	/** Re-fetches the whole list. The sidebar's ordering and previews come from it. */
	refresh: () => void;
}

/**
 * The sidebar's list, and the four events that keep it true.
 *
 * Extracted from `ChatPage` for the reason `ConversationSidebar` was: the page
 * was over the 300-line limit, and this is the piece of it that is genuinely one
 * subject. Every one of these handlers writes the same array, and three of them
 * have to agree about what a conversation looks like after somebody else
 * changed it.
 *
 * `currentUserId` is a parameter rather than read from the store, because
 * exactly one handler needs it and passing it keeps this hook a function of its
 * inputs.
 */
export function useConversationList(
	currentUserId: string | undefined,
	onConversationLeft: (conversationId: string) => void,
) {
	const [conversations, setConversations] = useState<ConversationDTO[]>([]);

	usePresenceLastSeenSync(setConversations);

	const refresh = useCallback(() => {
		void api.listConversations().then(setConversations);
	}, []);

	useEffect(refresh, [refresh]);

	useSocketEvent(
		"conversation:new",
		useCallback((conversation: ConversationDTO) => {
			// Appears immediately even though it has no messages yet — that is the
			// whole point of the event. De-duplicated by id because the creator
			// also receives it, and they already added it from the HTTP response.
			setConversations((current) =>
				current.some((existing) => existing.id === conversation.id) ? current : [conversation, ...current],
			);
		}, []),
	);

	useSocketEvent(
		"conversation:read",
		useCallback(
			(event: ConversationReadEvent) => {
				// Patched in place rather than triggering a refetch: this fires
				// whenever anyone glances at any conversation, and re-listing the
				// sidebar each time would be a request per glance per participant.
				setConversations((current) =>
					current.map((conversation) => {
						if (conversation.id !== event.conversationId) return conversation;

						return {
							...conversation,
							participants: conversation.participants.map((participant) =>
								participant.id === event.userId
									? { ...participant, lastReadMessageId: event.lastReadMessageId }
									: participant,
							),
							// Your own marker moving is the badge clearing — including when
							// it moved on another device, which is the case a refetch-only
							// approach leaves lit until something else happens.
							unreadCount: event.userId === currentUserId ? 0 : conversation.unreadCount,
						};
					}),
				);
			},
			[currentUserId],
		),
	);

	useSocketEvent(
		"conversation:updated",
		useCallback((event: ConversationUpdatedEvent) => {
			// Patched in place, and only the two fields the event actually carries
			// — `unreadCount` and `lastMessage` are deliberately absent from it
			// (see the type's doc comment), so leaving them untouched here is what
			// keeps them correct rather than overwriting them with nothing.
			setConversations((current) =>
				current.map((conversation) =>
					conversation.id === event.conversationId
						? { ...conversation, name: event.name, participants: event.participants }
						: conversation,
				),
			);
		}, []),
	);

	useSocketEvent(
		"conversation:left",
		useCallback(
			(event: ConversationLeftEvent) => {
				// Fires whether this tab removed itself, another tab of the same
				// session did, or someone else kicked this user — one event for all
				// three, so this is the only place any of them get handled.
				setConversations((current) =>
					current.filter((conversation) => conversation.id !== event.conversationId),
				);
				// The page decides what to do about it: only it knows whether this is
				// the conversation currently on screen.
				onConversationLeft(event.conversationId);
			},
			[onConversationLeft],
		),
	);

	return { conversations, refresh } satisfies ConversationList;
}
