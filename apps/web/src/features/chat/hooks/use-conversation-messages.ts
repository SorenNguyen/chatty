import type { MessageDTO, ReactionKind } from "@chatty/shared-types";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/hooks/use-auth";
import { MESSAGE_PAGE_SIZE } from "../constants/pagination";
import type { ThreadMessage } from "../types/thread-message";
import { buildDraftMessage, getNewestStoredMessage } from "../utils/build-draft-message";
import { mergeReloadedMessages } from "../utils/merge-messages";
import { toReplyQuote } from "../utils/reply-quote";
import { useMessageActions } from "./use-message-actions";
import { useSocketEvent } from "./use-socket-event";

interface ConversationMessages {
	/** Oldest first, which is the order the view reads. */
	messages: ThreadMessage[];
	hasMoreOlder: boolean;
	isLoadingOlder: boolean;
	hasMoreNewer: boolean;
	isLoadingNewer: boolean;
	/** True while the first page of a conversation is in flight. */
	isLoadingThread: boolean;
	/** Why the first page could not be fetched, or "" when it could. */
	loadError: string;
	/** Fetches the first page again after `loadError`. */
	retryLoad: () => void;
	loadOlder: () => void;
	loadNewer: () => void;
	/** Catches the thread up after the socket was down. See `useSocketConnection`. */
	resync: () => void;
	/**
	 * Sends a message. Resolves once the server has it, but the bubble is on
	 * screen long before that — see the implementation.
	 */
	sendMessage: (
		content: string,
		attachments: File[],
		replyTo: MessageDTO | null,
		onProgress?: (percent: number) => void,
	) => Promise<void>;
	/**
	 * Sends a saved sticker. Not optimistic: a sticker's picture has dimensions
	 * the client does not know until it decodes the file, and the bubble-less
	 * layout reserves space from them — a sticker that resizes on arrival is
	 * worse than one that appears a beat later.
	 */
	sendSticker: (stickerId: string, replyTo: MessageDTO | null) => Promise<void>;
	/** Sends a draft that failed, again. */
	retrySend: (draftId: string) => void;
	/** Throws a failed draft away. */
	discardDraft: (draftId: string) => void;
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
	const [messages, setMessages] = useState<ThreadMessage[]>([]);
	const [hasMoreOlder, setHasMoreOlder] = useState(false);
	const [isLoadingOlder, setIsLoadingOlder] = useState(false);
	const [hasMoreNewer, setHasMoreNewer] = useState(false);
	const [isLoadingNewer, setIsLoadingNewer] = useState(false);
	const [isLoadingThread, setIsLoadingThread] = useState(false);
	const [loadError, setLoadError] = useState("");
	// Bumped by `retryLoad` to re-run the effect below without changing which
	// conversation or message it is loading.
	const [reloadCount, setReloadCount] = useState(0);
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
			setLoadError("");

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

		setIsLoadingThread(true);
		setLoadError("");

		void request
			.then((page) => {
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
			})
			.catch((error: Error) => {
				// Without this the thread rendered empty on any failure, which is the
				// one thing a conversation with history is definitely not — and it
				// offered nothing to try again with.
				if (!isCurrent) return;

				setMessages([]);
				setLoadError(error.message);
			})
			.finally(() => {
				if (isCurrent) setIsLoadingThread(false);
			});

		return () => {
			isCurrent = false;
		};
	}, [conversationId, requestedMessageId, reloadCount]);

	const retryLoad = useCallback(() => setReloadCount((current) => current + 1), []);

	/**
	 * Refetches the newest page and folds it into what is on screen.
	 *
	 * A page rather than everything after the newest held message, because the
	 * gap a dead socket leaves is not only missing messages: an edit, a delete or
	 * a reaction that landed while it was down changed a message that is still
	 * displayed, and appending cannot repair that. See `mergeReloadedMessages`.
	 *
	 * Skipped while `hasMoreNewer` is true. That state means the reader jumped to
	 * a search result and is looking at a window in the middle of the history;
	 * pulling them to the live end would throw away the thing they went to find.
	 */
	const resync = useCallback(() => {
		if (!conversationId || hasMoreNewer) return;

		void api
			.listMessages(conversationId, { limit: MESSAGE_PAGE_SIZE })
			.then((page) => {
				const reloaded = [...page].reverse();
				const merged = mergeReloadedMessages(messages, reloaded);
				setMessages(merged);

				// The oldest message on screen changing means the merge found no
				// overlap and dropped the loaded history, so older messages are behind
				// a cursor again rather than already fetched.
				if (merged[0]?.id !== messages[0]?.id) setHasMoreOlder(page.length === MESSAGE_PAGE_SIZE);
			})
			.catch(() => {
				// Leaves the screen exactly as it was, which is where it already was.
				// The connection banner is still up and the next reconnect tries again.
			});
	}, [conversationId, hasMoreNewer, messages]);

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
		// The newest *stored* message, not the newest on screen: a draft's id names
		// nothing on the server, so paging from one asks for messages after a
		// cursor that does not exist.
		const newestMessage = getNewestStoredMessage(messages);
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

	/**
	 * Puts a draft on the wire and settles it, whichever way it goes.
	 *
	 * The success branch removes the draft rather than replacing it with the
	 * server's message, *unless* the message is not already there. The socket
	 * broadcast regularly beats this response — the server emits it before the
	 * response is serialised — so by the time this resolves the real message is
	 * usually on screen already, and replacing by draft id would show it twice.
	 */
	const deliver = useCallback(async (draft: ThreadMessage) => {
		try {
			const sent = await api.sendMessage(
				draft.conversationId,
				draft.content,
				undefined,
				undefined,
				draft.replyTo?.id,
			);

			setMessages((current) => {
				const withoutDraft = current.filter((message) => message.id !== draft.id);

				return withoutDraft.some((message) => message.id === sent.id) ? withoutDraft : [...withoutDraft, sent];
			});
		} catch {
			// Kept on screen rather than removed, and this is the whole point of the
			// state: a message that vanishes on a dropped connection takes the text
			// with it, and the sender usually does not notice until much later.
			setMessages((current) =>
				current.map((message) => (message.id === draft.id ? { ...message, deliveryState: "failed" } : message)),
			);
		}
	}, []);

	/**
	 * Sends a message, showing it immediately.
	 *
	 * **Text only.** A send carrying images deliberately keeps the old
	 * behaviour — awaited in the composer, with the upload's progress bar. An
	 * optimistic gallery would have to state each picture's dimensions to
	 * reserve its space, and the client does not know them until it has decoded
	 * the files; a gallery that resizes when the upload finishes is worse than
	 * the progress bar that is already there and says more.
	 */
	const sendMessage = useCallback(
		async (
			content: string,
			attachments: File[],
			replyTo: MessageDTO | null,
			onProgress?: (percent: number) => void,
		) => {
			if (!conversationId) return;

			if (attachments.length > 0) {
				await api.sendMessage(conversationId, content, attachments, onProgress, replyTo?.id);

				return;
			}

			const author = useAuth.getState().currentUser;
			if (!author) return;

			const draft = buildDraftMessage(conversationId, author, content, replyTo ? toReplyQuote(replyTo) : null);
			setMessages((current) => [...current, draft]);

			await deliver(draft);
		},
		[conversationId, deliver],
	);

	const sendSticker = useCallback(
		async (stickerId: string, replyTo: MessageDTO | null) => {
			if (!conversationId) return;

			await api.sendSticker(conversationId, stickerId, replyTo?.id);
		},
		[conversationId],
	);

	const retrySend = useCallback(
		(draftId: string) => {
			const draft = messages.find((message) => message.id === draftId);
			if (!draft) return;

			const retried: ThreadMessage = { ...draft, deliveryState: "pending" };
			setMessages((current) => current.map((message) => (message.id === draftId ? retried : message)));
			void deliver(retried);
		},
		[messages, deliver],
	);

	const discardDraft = useCallback((draftId: string) => {
		setMessages((current) => current.filter((message) => message.id !== draftId));
	}, []);

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
		isLoadingThread,
		loadError,
		retryLoad,
		resync,
		sendMessage,
		sendSticker,
		retrySend,
		discardDraft,
		editMessage,
		deleteMessage,
		toggleReaction,
		hideMessage,
		targetMessageId,
	};
}
