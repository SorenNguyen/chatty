import type { MessageDTO, ParticipantDTO, ReactionEmoji } from "@chatty/shared-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/button";
import type { ThreadMessage } from "../types/thread-message";
import { MAX_RETAINED_MESSAGES } from "../constants/pagination";
import { useMessageEditing, useMessageScroll, useUnreadDivider } from "../hooks";
import { getReadReceipt, scrollToMessage } from "../utils";
import { MessageEditHistory } from "./message-edit-history";
import { MessageRows } from "./message-rows";
import { ReactionDetailsPanel } from "./reaction-details-panel";
import { ScrollToLatestButton } from "./scroll-to-latest-button";

interface MessageListProps {
	conversationId: string;
	messages: ThreadMessage[];
	unreadCount: number;
	currentUserId: string;
	participants: ParticipantDTO[];
	/**
	 * Whether to name the author above each incoming bubble.
	 *
	 * Passed in rather than derived from `participants.length`, which is what it
	 * used to be: a three-person group that loses a member still needs the names
	 * — the messages of the person who left are exactly the ones that become
	 * unattributable without them.
	 */
	isGroup: boolean;
	/**
	 * Whether the viewer shares their own read receipts. False hides the "Seen"
	 * marker entirely — the setting is symmetric, so somebody who has stopped
	 * sending theirs stops seeing everyone else's.
	 */
	areReceiptsShared: boolean;
	/**
	 * True while the first page is in flight. Without it an unfinished load and
	 * an empty conversation render identically, so a slow network shows "No
	 * messages yet. Say hello." over a thread that has years in it.
	 */
	isLoadingThread: boolean;
	hasMoreOlder: boolean;
	isLoadingOlder: boolean;
	onLoadOlder: () => void;
	hasMoreNewer: boolean;
	isLoadingNewer: boolean;
	onLoadNewer: () => void;
	/**
	 * Both write over HTTP and return once the server has accepted. Neither
	 * updates this list — the `message:updated` broadcast does, so the author
	 * sees their own change through the same path everyone else does.
	 */
	onEditMessage: (messageId: string, content: string) => void;
	onDeleteMessage: (messageId: string) => void;
	onHideMessage: (messageId: string) => void;
	/** Both act on a draft this tab failed to send, never on a stored message. */
	onRetrySend: (draftId: string) => void;
	onDiscardDraft: (draftId: string) => void;
	onToggleReaction: (messageId: string, emoji: ReactionEmoji) => void;
	/** Puts a message in the composer's reply slot. Owned by the page, which owns the composer. */
	onReplyToMessage: (message: MessageDTO) => void;
	onForwardMessage: (message: MessageDTO) => void;
	onSaveMessage: (messageId: string) => void;
	onTogglePinMessage: (messageId: string, isPinned: boolean) => void;
	pinnedMessageIds: string[];
	onJumpToMessage: (messageId: string) => void;
	/** Drops the oldest page once the thread outgrows what it needs — see `MAX_RETAINED_MESSAGES`. */
	onTrimHistory: () => void;
	requestEditLast: number;
	requestCancelEdit: number;
	onEditingStateChange: (isEditing: boolean) => void;
	targetMessageId?: string | null;
	onReturnToLatest?: () => void;
}

/**
 * The thread: day rules, system lines and message rows, in one scroll container.
 *
 * What stays here rather than moving into `MessageRow` is everything a row
 * cannot answer on its own — where the day changes, where a run of messages from
 * one person begins, which single message the "Seen" marker belongs on, and
 * which one is open for editing.
 */
export function MessageList({
	conversationId,
	messages,
	unreadCount,
	currentUserId,
	participants,
	isGroup,
	areReceiptsShared,
	isLoadingThread,
	hasMoreOlder,
	isLoadingOlder,
	onLoadOlder,
	hasMoreNewer,
	isLoadingNewer,
	onLoadNewer,
	onEditMessage,
	onDeleteMessage,
	onHideMessage,
	onRetrySend,
	onDiscardDraft,
	onToggleReaction,
	onReplyToMessage,
	onForwardMessage,
	onSaveMessage,
	onTogglePinMessage,
	pinnedMessageIds,
	onJumpToMessage,
	onTrimHistory,
	requestEditLast,
	requestCancelEdit,
	onEditingStateChange,
	targetMessageId,
	onReturnToLatest,
}: MessageListProps) {
	// The scroll container lives here rather than in the page, so everything that
	// reads or writes scroll position sits in one component.
	const { containerRef, handleScroll, isFarFromBottom, scrollToLatest, isPinnedToLatestRef } = useMessageScroll({
		messages,
		hasMoreOlder,
		isLoadingOlder,
		onLoadOlder,
	});
	// Memoised because it is a prop of the memoised `MessageRows`, and it is an
	// object: recomputed per render it would be a new reference every time and
	// would defeat the memo on its own. It also walks the whole thread, so not
	// redoing it on an unrelated render is worth something by itself.
	const readReceipt = useMemo(
		() => getReadReceipt(messages, participants, currentUserId, areReceiptsShared),
		[messages, participants, currentUserId, areReceiptsShared],
	);
	const { editingMessageId, startEdit, cancelEdit } = useMessageEditing({
		messages,
		currentUserId,
		requestEditLast,
		requestCancelEdit,
		onEditingStateChange,
	});
	const [historyMessageId, setHistoryMessageId] = useState<string | null>(null);
	// By id rather than by value, for the reason `editingMessageId` is: the
	// reactions on screen have to follow the `message:updated` broadcasts that
	// arrive while the dialog is open, and a snapshot would freeze the list at
	// whatever it said when it was opened.
	const [reactionsMessageId, setReactionsMessageId] = useState<string | null>(null);
	const { unreadDividerMessageId, initialUnreadCount } = useUnreadDivider({
		conversationId,
		messages,
		unreadCount,
	});

	useEffect(() => {
		if (!targetMessageId) return;

		scrollToMessage(targetMessageId, "auto");
	}, [targetMessageId, messages]);

	/*
	 * Three conditions, and each one is a way the reader would notice:
	 *
	 *  - **At the bottom.** Trimming above somebody who is reading history would
	 *    take the messages out from under them. The ref rather than
	 *    `isFarFromBottom` because this must not re-run on every scroll event.
	 *  - **Not looking at a jumped-to message.** A search result opens the thread
	 *    around an old message with newer ones still unloaded; the newest message
	 *    is not on screen even though the scroll position says bottom.
	 *  - **Nothing newer left to load**, which is the same situation seen from
	 *    the other side.
	 */
	useEffect(() => {
		if (messages.length <= MAX_RETAINED_MESSAGES) return;
		if (targetMessageId || hasMoreNewer || !isPinnedToLatestRef.current) return;

		onTrimHistory();
	}, [messages, targetMessageId, hasMoreNewer, onTrimHistory, isPinnedToLatestRef]);

	const reactionsMessage = reactionsMessageId
		? messages.find((message) => message.id === reactionsMessageId)
		: undefined;

	const handleSaveEdit = useCallback(
		(messageId: string, content: string) => {
			cancelEdit();
			onEditMessage(messageId, content);
		},
		[cancelEdit, onEditMessage],
	);

	return (
		<div className="relative h-full">
			<div ref={containerRef} onScroll={handleScroll} className="h-full overflow-y-auto bg-paper">
				{/* `justify-end` on a wrapper that is at least as tall as the viewport is
			    what makes a short conversation sit on the composer rather than
			    hanging from the header with a screen of empty paper under it. It
			    does nothing once the thread is long enough to scroll. */}
				<div className="flex min-h-full flex-col justify-end">
					{targetMessageId && onReturnToLatest && (
						<div className="sticky top-3 z-10 flex justify-center">
							<Button
								variant="outline"
								onClick={onReturnToLatest}
								className="eyebrow bg-paper-raised px-3.5 py-2 text-ink-soft"
							>
								Return to latest messages
							</Button>
						</div>
					)}

					{isLoadingOlder && (
						<p className="eyebrow py-4 text-center text-ink-faint">Loading earlier messages…</p>
					)}

					{!hasMoreOlder && messages.length > 0 && (
						<p className="eyebrow py-4 text-center text-ink-faint">
							This is the beginning of the conversation.
						</p>
					)}

					{messages.length === 0 ? (
						<p className="p-8 text-center text-sm text-ink-faint">
							{isLoadingThread ? "Loading messages…" : "No messages yet. Say hello."}
						</p>
					) : (
						<div className="flex flex-col px-3 pb-4 pt-2 sm:px-5 md:px-8 md:pb-5">
							<MessageRows
								messages={messages}
								currentUserId={currentUserId}
								participants={participants}
								isGroup={isGroup}
								readReceipt={readReceipt}
								unreadDividerMessageId={unreadDividerMessageId}
								unreadCount={initialUnreadCount}
								editingMessageId={editingMessageId}
								targetMessageId={targetMessageId}
								pinnedMessageIds={pinnedMessageIds}
								onStartEdit={startEdit}
								onSaveEdit={handleSaveEdit}
								onCancelEdit={cancelEdit}
								onDeleteMessage={onDeleteMessage}
								onHideMessage={onHideMessage}
								onShowHistory={setHistoryMessageId}
								onRetrySend={onRetrySend}
								onDiscardDraft={onDiscardDraft}
								onToggleReaction={onToggleReaction}
								onShowReactions={setReactionsMessageId}
								onReplyToMessage={onReplyToMessage}
								onForwardMessage={onForwardMessage}
								onSaveMessage={onSaveMessage}
								onTogglePinMessage={onTogglePinMessage}
								onJumpToMessage={onJumpToMessage}
							/>

							{hasMoreNewer && (
								<div className="mt-5 text-center">
									<Button
										variant="outline"
										onClick={onLoadNewer}
										disabled={isLoadingNewer}
										className="eyebrow bg-paper-raised px-3.5 py-2 text-ink-soft"
									>
										{isLoadingNewer ? "Loading newer messages…" : "Load newer messages"}
									</Button>
								</div>
							)}
						</div>
					)}
				</div>
			</div>

			{isFarFromBottom && (
				<ScrollToLatestButton
					unreadCount={unreadCount}
					onClick={hasMoreNewer && onReturnToLatest ? onReturnToLatest : scrollToLatest}
				/>
			)}

			{historyMessageId && messages[0] && (
				<MessageEditHistory
					conversationId={messages[0].conversationId}
					messageId={historyMessageId}
					onClose={() => setHistoryMessageId(null)}
				/>
			)}

			{/* Closed rather than emptied when the last reaction is taken off while
			    it is open: an empty dialog is a dead end, and the only way to reach
			    zero from here is somebody undoing the thing being looked at. */}
			{reactionsMessage && reactionsMessage.reactions.length > 0 && (
				<ReactionDetailsPanel
					reactions={reactionsMessage.reactions}
					users={participants}
					currentUserId={currentUserId}
					onClose={() => setReactionsMessageId(null)}
				/>
			)}
		</div>
	);
}
