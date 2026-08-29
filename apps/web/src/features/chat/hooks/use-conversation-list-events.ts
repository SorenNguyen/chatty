import type {
	ConversationDTO,
	ConversationLeftEvent,
	ConversationReadEvent,
	ConversationUpdatedEvent,
} from "@chatty/shared-types";
import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";
import { useSocketEvent } from "./use-socket-event";

interface ConversationListEventsOptions {
	setConversations: Dispatch<SetStateAction<ConversationDTO[]>>;
	currentUserId: string | undefined;
	selectedConversationId: string | null;
	/** Called when the open conversation is one this user is no longer in, so the page can deselect it. */
	onSelectedConversationLeft: () => void;
}

/**
 * Keeps the sidebar list in step with what the server broadcasts.
 *
 * Four events, all of them patching the same array, extracted from ChatPage
 * because together they were the largest thing in it and none of them are about
 * the page's own state — they are about one list staying true. The page still
 * owns the array; this only says how each event changes it.
 *
 * Every handler patches in place rather than refetching. That is the point of
 * the events carrying payloads at all: `conversation:read` fires whenever anyone
 * glances at anything, and re-listing the sidebar per glance per participant is
 * a request storm for information already in hand.
 */
export function useConversationListEvents({
	setConversations,
	currentUserId,
	selectedConversationId,
	onSelectedConversationLeft,
}: ConversationListEventsOptions) {
	useSocketEvent(
		"conversation:new",
		useCallback(
			(conversation: ConversationDTO) => {
				// Appears immediately even though it has no messages yet — that is the
				// whole point of the event. De-duplicated by id because the creator
				// also receives it, and they already added it from the HTTP response.
				setConversations((current) =>
					current.some((existing) => existing.id === conversation.id) ? current : [conversation, ...current],
				);
			},
			[setConversations],
		),
	);

	useSocketEvent(
		"conversation:read",
		useCallback(
			(event: ConversationReadEvent) => {
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
			[setConversations, currentUserId],
		),
	);

	useSocketEvent(
		"conversation:updated",
		useCallback(
			(event: ConversationUpdatedEvent) => {
				// Only the two fields the event actually carries — `unreadCount` and
				// `lastMessage` are deliberately absent from it (see the type's doc
				// comment), so leaving them untouched here is what keeps them correct
				// rather than overwriting them with nothing.
				setConversations((current) =>
					current.map((conversation) =>
						conversation.id === event.conversationId
							? { ...conversation, name: event.name, participants: event.participants }
							: conversation,
					),
				);
			},
			[setConversations],
		),
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

				if (event.conversationId === selectedConversationId) onSelectedConversationLeft();
			},
			[setConversations, selectedConversationId, onSelectedConversationLeft],
		),
	);
}
