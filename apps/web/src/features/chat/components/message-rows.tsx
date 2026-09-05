import type { ParticipantDTO, ReactionEmoji } from "@chatty/shared-types";
import { Fragment, memo } from "react";
import type { ThreadMessage } from "../types/thread-message";
import type { ReadReceipt } from "../utils/read-receipt";
import { getClusterPosition, hasMessageTimeGap, isNewDay, isWithinMessageBurst, scrollToMessage } from "../utils";
import { DaySeparator } from "./day-separator";
import { MessageRow } from "./message-row";
import { MessageTimeSeparator } from "./message-time-separator";
import { SystemMessage } from "./system-message";
import { UnreadDivider } from "./unread-divider";

interface MessageRowsProps {
	messages: ThreadMessage[];
	currentUserId: string;
	participants: ParticipantDTO[];
	isGroup: boolean;
	readReceipt: ReadReceipt | null;
	unreadDividerMessageId: string | null;
	unreadCount: number;
	editingMessageId: string | null;
	targetMessageId?: string | null | undefined;
	pinnedMessageIds: string[];
	onStartEdit: (messageId: string) => void;
	onSaveEdit: (messageId: string, content: string) => void;
	onCancelEdit: () => void;
	onDeleteMessage: (messageId: string) => void;
	onHideMessage: (messageId: string) => void;
	onShowHistory: (messageId: string) => void;
	onRetrySend: (messageId: string) => void;
	onDiscardDraft: (messageId: string) => void;
	onToggleReaction: (messageId: string, emoji: ReactionEmoji) => void;
	/** Opens the reactor list. One dialog for the whole thread, owned by `MessageList`. */
	onShowReactions: (messageId: string) => void;
	onReplyToMessage: (message: ThreadMessage) => void;
	onForwardMessage: (message: ThreadMessage) => void;
	onSaveMessage: (messageId: string) => void;
	onTogglePinMessage: (messageId: string, isPinned: boolean) => void;
	onJumpToMessage: (messageId: string) => void;
}

/**
 * Memoised, and this is the one that pays for the whole phase-46 render work.
 *
 * `ChatPage` holds presence and typing state, so a `typing:update` — 109 bytes,
 * several per sentence, per typist — re-rendered it and everything under it,
 * down to `MAX_RETAINED_MESSAGES` message rows that had nothing to do with
 * either. A busy group reconciled its entire thread several times a second
 * because somebody was holding down a key.
 *
 * `MAX_RETAINED_MESSAGES` already bounds how *long* this array is, and the
 * reasoning in `constants/pagination.ts` for preferring that to windowing still
 * holds — but a bound on length says nothing about how *often* the list is
 * walked, and that was the cost.
 *
 * The memo only works while every prop below is referentially stable, which is
 * why `readReceipt` is a `useMemo` in `MessageList`, `cancelEdit` a `useCallback`
 * in `useMessageEditing`, and the handlers in `ChatPage` are wrapped rather than
 * written inline. Adding an inline `onSomething={() => ...}` at any of those call
 * sites silently turns this back off — it will still be correct, and it will
 * quietly cost what it cost before.
 */
export const MessageRows = memo(function MessageRows({
	messages,
	currentUserId,
	participants,
	isGroup,
	readReceipt,
	unreadDividerMessageId,
	unreadCount,
	editingMessageId,
	targetMessageId,
	pinnedMessageIds,
	onStartEdit,
	onSaveEdit,
	onCancelEdit,
	onDeleteMessage,
	onHideMessage,
	onShowHistory,
	onRetrySend,
	onDiscardDraft,
	onToggleReaction,
	onShowReactions,
	onReplyToMessage,
	onForwardMessage,
	onSaveMessage,
	onTogglePinMessage,
	onJumpToMessage,
}: MessageRowsProps) {
	return messages.map((message, index) => {
		const previous = messages[index - 1];
		const isFirstOfDay = isNewDay(message.createdAt, previous?.createdAt);
		const hasLongPause = !isFirstOfDay && hasMessageTimeGap(message.createdAt, previous?.createdAt);
		const divider = message.id === unreadDividerMessageId ? <UnreadDivider count={unreadCount} /> : null;

		if (message.kind === "system") {
			return (
				<Fragment key={message.id}>
					{divider}
					{isFirstOfDay && <DaySeparator isoTimestamp={message.createdAt} />}
					{hasLongPause && <MessageTimeSeparator isoTimestamp={message.createdAt} />}
					<SystemMessage content={message.content} createdAt={message.createdAt} />
				</Fragment>
			);
		}

		const author = message.author;
		const isDeleted = Boolean(message.deletedAt);
		const isWithinPreviousBurst = isWithinMessageBurst(message.createdAt, previous?.createdAt);
		const isFirstOfRun =
			!author ||
			isDeleted ||
			isFirstOfDay ||
			!isWithinPreviousBurst ||
			Boolean(message.replyTo) ||
			Boolean(previous?.deletedAt) ||
			previous?.author?.id !== author.id;
		const next = messages[index + 1];
		const isWithinNextBurst = next ? isWithinMessageBurst(next.createdAt, message.createdAt) : false;
		// Time belongs to the conversation's rhythm, not to its speaker turns.
		// In a lively group every alternating author is a separate visual run; if
		// run boundaries also printed time, a single minute became a wall of the
		// same timestamp. Keep one visible anchor at the end of the shared activity
		// burst and leave each individual time available on hover or keyboard focus.
		const isTimeAnchor =
			!next || next.kind === "system" || !isWithinNextBurst || isNewDay(next.createdAt, message.createdAt);
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
		const isPinned = pinnedMessageIds.includes(message.id);

		return (
			<Fragment key={message.id}>
				{divider}
				{isFirstOfDay && <DaySeparator isoTimestamp={message.createdAt} />}
				{hasLongPause && <MessageTimeSeparator isoTimestamp={message.createdAt} />}
				<MessageRow
					message={message}
					isMine={author?.id === currentUserId}
					isGroup={isGroup}
					isFirstOfRun={isFirstOfRun}
					isTimeAnchor={isTimeAnchor}
					clusterPosition={getClusterPosition(isFirstOfRun, isLastOfRun)}
					isTargeted={message.id === targetMessageId}
					isEditing={editingMessageId === message.id}
					receipt={readReceipt?.messageId === message.id ? readReceipt : null}
					onStartEdit={() => onStartEdit(message.id)}
					onSaveEdit={(content) => onSaveEdit(message.id, content)}
					onCancelEdit={onCancelEdit}
					onDeleteForEveryone={() => onDeleteMessage(message.id)}
					onDeleteForMe={() => onHideMessage(message.id)}
					onShowHistory={() => onShowHistory(message.id)}
					onRetrySend={() => onRetrySend(message.id)}
					onDiscardDraft={() => onDiscardDraft(message.id)}
					currentUserId={currentUserId}
					participants={participants}
					onToggleReaction={(emoji) => onToggleReaction(message.id, emoji)}
					onShowReactions={() => onShowReactions(message.id)}
					onReply={() => onReplyToMessage(message)}
					onForward={() => onForwardMessage(message)}
					onSave={() => onSaveMessage(message.id)}
					isPinned={isPinned}
					onTogglePin={() => onTogglePinMessage(message.id, isPinned)}
					onJumpToReplyOriginal={() => {
						const originalId = message.replyTo?.id;
						if (originalId && !scrollToMessage(originalId)) onJumpToMessage(originalId);
					}}
				/>
			</Fragment>
		);
	});
});
