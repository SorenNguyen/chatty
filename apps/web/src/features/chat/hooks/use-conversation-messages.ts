import type { MessageDTO, ReactionKind } from "@chatty/shared-types";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { MESSAGE_PAGE_SIZE } from "../constants/pagination";
import { useMessageActions } from "./use-message-actions";
import { useSocketEvent } from "./use-socket-event";

interface ConversationMessages {
	/** Oldest first, which is the order the view reads. */
	messages: MessageDTO[];
	hasMoreOlder: boolean;
	isLoadingOlder: boolean;
	hasMoreNewer: boolean;
	isLoadingNewer: boolean;
	loadOlder: () => void;
	loadNewer: () => void;
	editMessage: (messageId: string, content: string) => void;
	deleteMessage: (messageId: string) => void;
	toggleReaction: (messageId: string, kind: ReactionKind) => void;
	hideMessage: (messageId: string) => void;
	targetMessageId: string | null;
}

/**
 * The whole life of one conversation's message list: the first page, older
 * pages, messages arriving, and messages changing.
 *
 * These were four separate pieces of `ChatPage`, and they were never really
 * independent — every one of them writes the same array, and three of them have
 * to agree about what "already on screen" means. Splitting them apart again
 * would mean handing `setMessages` to four callers and hoping.
 *
 * What is deliberately *not* here: the read marker. `useMarkRead` takes the id
 * of the newest loaded message, which is a fact about the page's viewport rather
 * than about this list.
 */
export function useConversationMessages(
	conversationId: string | null,
	onConversationsChanged: () => void,
	requestedMessageId: string | null = null,
): ConversationMessages {
	const [messages, setMessages] = useState<MessageDTO[]>([]);
	const [hasMoreOlder, setHasMoreOlder] = useState(false);
	const [isLoadingOlder, setIsLoadingOlder] = useState(false);
	const [hasMoreNewer, setHasMoreNewer] = useState(false);
	const [isLoadingNewer, setIsLoadingNewer] = useState(false);
	const [targetMessageId, setTargetMessageId] = useState<string | null>(null);

	const { editMessage, deleteMessage, toggleReaction } = useMessageActions(
		conversationId,
		setMessages,
		onConversationsChanged,
	);
	const hideMessage = useCallback(
		(messageId: string) => {
			if (!conversationId) return;
			void api.hideMessage(conversationId, messageId);
		},
		[conversationId],
	);

	useEffect(() => {
		if (!conversationId) {
			setMessages([]);
			setHasMoreOlder(false);

			return;
		}

		let isCurrent = true;

		const request = requestedMessageId
			? api.getMessageContext(conversationId, requestedMessageId, MESSAGE_PAGE_SIZE)
			: api.listMessages(conversationId, { limit: MESSAGE_PAGE_SIZE }).then((page) => ({
					messages: [...page].reverse(),
					hasMoreOlder: page.length === MESSAGE_PAGE_SIZE,
					hasMoreNewer: false,
				}));

		void request.then((page) => {
			// Switching conversations quickly can land an older response after a
			// newer one; without this the wrong conversation's messages appear.
			if (!isCurrent) return;

			// The API returns newest-first for pagination; the view reads oldest-first.
			setMessages(page.messages);
			// A full page probably means more exist. When the total is an exact
			// multiple of the page size this costs one empty request at the end,
			// which is cheaper than asking the server for a count every time.
			setHasMoreOlder(page.hasMoreOlder);
			setHasMoreNewer(page.hasMoreNewer);
			setTargetMessageId(requestedMessageId);
		});

		return () => {
			isCurrent = false;
		};
	}, [conversationId, requestedMessageId]);

	const loadOlder = useCallback(() => {
		const oldestMessage = messages[0];
		if (!conversationId || !oldestMessage || isLoadingOlder || !hasMoreOlder) return;

		setIsLoadingOlder(true);
		void api
			.listMessages(conversationId, { limit: MESSAGE_PAGE_SIZE, before: oldestMessage.id })
			.then((page) => {
				setMessages((current) => [...[...page].reverse(), ...current]);
				setHasMoreOlder(page.length === MESSAGE_PAGE_SIZE);
			})
			.finally(() => setIsLoadingOlder(false));
	}, [conversationId, messages, isLoadingOlder, hasMoreOlder]);

	const loadNewer = useCallback(() => {
		const newestMessage = messages[messages.length - 1];
		if (!conversationId || !newestMessage || isLoadingNewer || !hasMoreNewer) return;
		setIsLoadingNewer(true);
		void api
			.listMessages(conversationId, { limit: MESSAGE_PAGE_SIZE, after: newestMessage.id })
			.then((page) => {
				setMessages((current) => [...current, ...page]);
				setHasMoreNewer(page.length === MESSAGE_PAGE_SIZE);
			})
			.finally(() => setIsLoadingNewer(false));
	}, [conversationId, messages, isLoadingNewer, hasMoreNewer]);

	useSocketEvent(
		"message:hidden",
		useCallback(
			(event: { conversationId: string; messageId: string }) => {
				if (event.conversationId === conversationId) {
					setMessages((current) => current.filter((message) => message.id !== event.messageId));
				}
				onConversationsChanged();
			},
			[conversationId, onConversationsChanged],
		),
	);

	useSocketEvent(
		"message:new",
		useCallback(
			(message: MessageDTO) => {
				if (message.conversationId === conversationId) {
					// Guard against duplicates: a reconnect can replay an event that
					// is already on screen.
					setMessages((current) =>
						current.some((existing) => existing.id === message.id) ? current : [...current, message],
					);
				}

				// Fires regardless of which conversation it belongs to, so the sidebar
				// preview and ordering stay correct for unopened threads.
				onConversationsChanged();
			},
			[conversationId, onConversationsChanged],
		),
	);

	return {
		messages,
		hasMoreOlder,
		isLoadingOlder,
		loadOlder,
		hasMoreNewer,
		isLoadingNewer,
		loadNewer,
		editMessage,
		deleteMessage,
		toggleReaction,
		hideMessage,
		targetMessageId,
	};
}
