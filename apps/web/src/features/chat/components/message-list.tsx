import type { MessageDTO, ParticipantDTO, ReactionKind } from "@chatty/shared-types";
import { Fragment, useEffect, useState } from "react";
import { Button } from "@/components/button";
import type { ThreadMessage } from "../types/thread-message";
import { useMessageScroll } from "../hooks";
import { getClusterPosition, getReadReceipt, hasMessageTimeGap, isNewDay, isWithinMessageBurst } from "../utils";
import { DaySeparator } from "./day-separator";
import { MessageEditHistory } from "./message-edit-history";
import { MessageRow } from "./message-row";
import { MessageTimeSeparator } from "./message-time-separator";
import { SystemMessage } from "./system-message";

interface MessageListProps {
	messages: ThreadMessage[];
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
	onToggleReaction: (messageId: string, kind: ReactionKind) => void;
	/** Puts a message in the composer's reply slot. Owned by the page, which owns the composer. */
	onReplyToMessage: (message: MessageDTO) => void;
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
	messages,
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
	targetMessageId,
	onReturnToLatest,
}: MessageListProps) {
	// The scroll container lives here rather than in the page, so everything that
	// reads or writes scroll position sits in one component.
	const { containerRef, handleScroll } = useMessageScroll({ messages, hasMoreOlder, isLoadingOlder, onLoadOlder });
	const readReceipt = getReadReceipt(messages, participants, currentUserId, areReceiptsShared);
	// Which message is open for editing, by id rather than by index: a page of
	// older messages prepends and would shift every index under the editor.
	const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
	const [historyMessageId, setHistoryMessageId] = useState<string | null>(null);

	useEffect(() => {
		if (!targetMessageId) return;

		document.getElementById(`message-${targetMessageId}`)?.scrollIntoView({ block: "center" });
	}, [targetMessageId, messages]);

	function handleSaveEdit(messageId: string, content: string) {
		setEditingMessageId(null);
		onEditMessage(messageId, content);
	}

	return (
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

				{isLoadingOlder && <p className="eyebrow py-4 text-center text-ink-faint">Loading earlier messages…</p>}

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
						{messages.map((message, index) => {
							const previous = messages[index - 1];
							const isFirstOfDay = isNewDay(message.createdAt, previous?.createdAt);
							const hasLongPause =
								!isFirstOfDay && hasMessageTimeGap(message.createdAt, previous?.createdAt);

							if (message.kind === "system") {
								return (
									<Fragment key={message.id}>
										{isFirstOfDay && <DaySeparator isoTimestamp={message.createdAt} />}
										{hasLongPause && <MessageTimeSeparator isoTimestamp={message.createdAt} />}
										<SystemMessage content={message.content} createdAt={message.createdAt} />
									</Fragment>
								);
							}

							const author = message.author;
							// One avatar and one byline per run of messages from the same
							// person. Repeating them on every line turns a paragraph typed in
							// three bursts into three faces stacked down the margin. A system
							// line or a change of day between two of someone's messages breaks
							// the run, which is what makes the avatar reappear underneath it
							// rather than leaving a bare bubble.
							//
							// An authorless message never continues a run, and never starts one
							// anything else can join: two deleted accounts are not one person,
							// and comparing `undefined` to `undefined` would say they were.
							// A tombstone breaks the run on both sides and belongs to no one:
							// nothing was said, so there is no turn for it to continue or to
							// carry on from. Without this a deleted message in the middle of a
							// burst leaves the two halves seamed together as though it were
							// still there.
							const isDeleted = Boolean(message.deletedAt);
							// A reply opens a run of its own even from the same person: it
							// points somewhere else, so it is a new turn, and it takes full
							// corners on top to say so. A pause longer than the burst window
							// also starts a turn; otherwise two messages five hours apart would
							// be seamed together just because nobody else spoke in between.
							const isWithinPreviousBurst = isWithinMessageBurst(message.createdAt, previous?.createdAt);
							const isFirstOfRun =
								!author ||
								isDeleted ||
								isFirstOfDay ||
								!isWithinPreviousBurst ||
								Boolean(message.replyTo) ||
								Boolean(previous?.deletedAt) ||
								previous?.author?.id !== author.id;
							// The one message of a run that states its time without being asked.
							// A run ends at a change of author, a system line, a new day, or the
							// end of the list.
							const next = messages[index + 1];
							const isWithinNextBurst = next
								? isWithinMessageBurst(next.createdAt, message.createdAt)
								: false;
							const isLastOfRun =
								!author ||
								isDeleted ||
								!next ||
								next.kind === "system" ||
								!isWithinNextBurst ||
								Boolean(next.replyTo) ||
								Boolean(next.deletedAt) ||
								next.author?.id !== author.id ||
								isNewDay(next.createdAt, message.createdAt);
							const clusterPosition = getClusterPosition(isFirstOfRun, isLastOfRun);

							return (
								<Fragment key={message.id}>
									{isFirstOfDay && <DaySeparator isoTimestamp={message.createdAt} />}
									{hasLongPause && <MessageTimeSeparator isoTimestamp={message.createdAt} />}
									<MessageRow
										message={message}
										isMine={author?.id === currentUserId}
										isGroup={isGroup}
										isFirstOfRun={isFirstOfRun}
										clusterPosition={clusterPosition}
										isTargeted={message.id === targetMessageId}
										isEditing={editingMessageId === message.id}
										receipt={readReceipt?.messageId === message.id ? readReceipt : null}
										onStartEdit={() => setEditingMessageId(message.id)}
										onSaveEdit={(content) => handleSaveEdit(message.id, content)}
										onCancelEdit={() => setEditingMessageId(null)}
										onDeleteForEveryone={() => onDeleteMessage(message.id)}
										onDeleteForMe={() => onHideMessage(message.id)}
										onShowHistory={() => setHistoryMessageId(message.id)}
										onRetrySend={() => onRetrySend(message.id)}
										onDiscardDraft={() => onDiscardDraft(message.id)}
										currentUserId={currentUserId}
										participants={participants}
										onToggleReaction={(kind) => onToggleReaction(message.id, kind)}
										onReply={() => onReplyToMessage(message)}
										// The quoted original may be outside the loaded page, in
										// which case there is nothing to scroll to and this is a
										// no-op rather than a jump to the wrong place.
										onJumpToReplyOriginal={() =>
											document
												.getElementById(`message-${message.replyTo?.id}`)
												?.scrollIntoView({ block: "center", behavior: "smooth" })
										}
									/>
								</Fragment>
							);
						})}

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

			{historyMessageId && messages[0] && (
				<MessageEditHistory
					conversationId={messages[0].conversationId}
					messageId={historyMessageId}
					onClose={() => setHistoryMessageId(null)}
				/>
			)}
		</div>
	);
}
