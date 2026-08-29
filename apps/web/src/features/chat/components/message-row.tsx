import type { MessageDTO, ReactionKind, UserDTO } from "@chatty/shared-types";
import { Ban, CheckCheck } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { DELETED_AUTHOR_NAME, DELETED_MESSAGE_TEXT, EDITED_MESSAGE_LABEL } from "../constants/message";
import { INCOMING_BUBBLE_RADIUS, OUTGOING_BUBBLE_RADIUS } from "../constants/message-cluster";
import type { ClusterPosition } from "../types/message-cluster";
import type { ReadReceipt } from "../utils/read-receipt";
import { formatMessageTime } from "../utils";
import { MessageActions } from "./message-actions";
import { MessageAttachment } from "./message-attachment";
import { MessageEditor } from "./message-editor";
import { MessageReactions } from "./message-reactions";
import { MessageReplyQuote } from "./message-reply-quote";

interface MessageRowProps {
	message: MessageDTO;
	isMine: boolean;
	isGroup: boolean;
	/** First of a run from the same author — the one that carries the avatar and the byline. */
	isFirstOfRun: boolean;
	/**
	 * Where this message sits in its run, which decides its corners: see the
	 * tables in `constants/message-cluster`. Also decides whether the timestamp
	 * stays on screen — a run states its time once, at the end.
	 */
	clusterPosition: ClusterPosition;
	/** The message a search result jumped to, highlighted until the reader moves on. */
	isTargeted: boolean;
	isEditing: boolean;
	/** Set only on the row the "Seen" marker belongs on; null everywhere else. */
	receipt: ReadReceipt | null;
	/** Whose view this is — the reaction chips need it to know which are theirs. */
	currentUserId: string;
	participants: UserDTO[];
	onToggleReaction: (kind: ReactionKind) => void;
	onReply: () => void;
	onJumpToReplyOriginal: () => void;
	onStartEdit: () => void;
	onSaveEdit: (content: string) => void;
	onCancelEdit: () => void;
	onDeleteForEveryone: () => void;
	onDeleteForMe: () => void;
	onShowHistory: () => void;
}

/**
 * One message somebody wrote.
 *
 * The bubble's bottom corner is cut to 2px on the side the message came from,
 * and that notch — not the fill — is what tells you who spoke: it survives
 * being read at a glance, in a screenshot, and by anyone who cannot tell the ink
 * block from the paper one by colour.
 *
 * Everything that is *about* the message rather than part of it — the time, the
 * edited marker, the read receipt, the actions — sits in a gutter beside the
 * bubble on the message's own centreline, never on a line beneath it. That is
 * one decision doing three jobs:
 *
 *  - A run of messages stacks at 3px instead of being pushed apart by a
 *    timestamp under each one, which is what made a burst of five messages read
 *    as five separate conversations.
 *  - The actions button lines up with the middle of the bubble it acts on. It
 *    used to be bottom-aligned to a column that contained the timestamp too, so
 *    it hung below the bubble and looked broken.
 *  - The gutter is laid out at full width and only *faded* in, so hovering a
 *    message reveals its time without moving a single pixel of the thread.
 */
export function MessageRow({
	message,
	isMine,
	isGroup,
	isFirstOfRun,
	clusterPosition,
	isTargeted,
	isEditing,
	receipt,
	currentUserId,
	participants,
	onToggleReaction,
	onReply,
	onJumpToReplyOriginal,
	onStartEdit,
	onSaveEdit,
	onCancelEdit,
	onDeleteForEveryone,
	onDeleteForMe,
	onShowHistory,
}: MessageRowProps) {
	const author = message.author;
	const isDeleted = Boolean(message.deletedAt);
	const isEdited = Boolean(message.editedAt) && !isDeleted;
	// A tombstone has no content and no image left to change, so the author's
	// two actions have nothing to act on — the row stays only to hold its place.
	const canModify = isMine && !isDeleted;
	// The time is kept on screen for the message that ends a burst and hidden on
	// the ones inside it: consecutive lines sent in the same minute would print
	// the same number four times. Anything else is a hover away, and an edited
	// message keeps its marker outright — a note saying "this is not what was
	// sent" must not need to be discovered.
	const isTimeAlwaysVisible = clusterPosition === "last" || clusterPosition === "solo" || Boolean(receipt);
	// The chips hang 11px below the bubble and are out of flow, so the space for
	// them has to be made here. The list already ends the run on a reacted
	// message, so what this margin adds to is the 16px between runs, not the 3px
	// inside one — a chip can never collide with the next bubble.
	const hasReactions = message.reactions.length > 0;
	const reactedKinds = message.reactions
		.filter((reaction) => reaction.userIds.includes(currentUserId))
		.map((reaction) => reaction.kind);

	return (
		<div
			id={`message-${message.id}`}
			className={cn(
				"flex flex-col rounded-bubble transition",
				// The gap between two people is four times the gap inside one
				// person's burst. That ratio is the only thing telling the eye where
				// one turn ends, now that the timestamps have left the vertical.
				isFirstOfRun ? "mt-4 first:mt-0" : "mt-[3px]",
				isTargeted && "bg-signal-soft ring-4 ring-signal-soft",
				isMine ? "items-end" : "items-start",
			)}
		>
			{/* Outside the hover row and indented past the avatar, so the name sits
			    over the bubble rather than over the face. Groups only: in a 1-1 the
			    header already names the one person it could possibly be. */}
			{!isMine && isFirstOfRun && isGroup && (
				<span className="eyebrow mb-1.5 ml-11 text-ink-soft">
					{/* A USER message with no author is one whose writer deleted their
					    account — still theirs to have said, no longer theirs to be
					    named for. */}
					{author ? author.displayName : DELETED_AUTHOR_NAME}
				</span>
			)}

			{/* `group` so the hover that reveals the actions and the time is the whole
			    row rather than the controls themselves, which are invisible until it
			    happens and so cannot be hovered first. */}
			<div
				className={cn(
					"group relative flex max-w-full items-center gap-2 sm:gap-3",
					isMine && "flex-row-reverse",
					hasReactions && "mb-3",
					!hasReactions && (isTimeAlwaysVisible || isEdited) && "max-sm:mb-4",
				)}
			>
				{/* The spacer keeps a run's later bubbles aligned with its first one;
				    without it they slide under the avatar. `self-end` rather than
				    centred, because a face floating halfway up a tall photograph
				    belongs to nothing. */}
				{!isMine &&
					(isFirstOfRun && author ? (
						<Avatar user={author} size="sm" className="self-end" />
					) : (
						<span className="size-8 shrink-0" />
					))}

				{/* Capped in absolute terms as well as proportionally: on a wide window
				    70% is a line of text long enough that the eye loses its place
				    returning to the left edge. On the bubble rather than on the row,
				    so the gutter beside it is not paid for out of the text's width. */}
				<div className="relative min-w-0 max-w-[76vw] sm:max-w-[min(62vw,34rem)]">
					{isDeleted ? (
						<div
							className={cn(
								// Round on all four corners, with no notch on either side. The
								// notch says "this is where a turn ends", and a tombstone is not
								// a turn — nothing was said. It is also why the list treats a
								// deleted message as belonging to no run at all.
								"flex items-center gap-2.5 rounded-bubble border border-dashed border-rule px-4 py-2.5 text-ink-faint",
							)}
						>
							<Ban aria-hidden="true" className="size-3.5 shrink-0" />
							<p className="text-[13px]">{DELETED_MESSAGE_TEXT}</p>
						</div>
					) : isEditing ? (
						<MessageEditor
							initialContent={message.content}
							hasAttachment={Boolean(message.attachment)}
							onSave={onSaveEdit}
							onCancel={onCancelEdit}
						/>
					) : (
						<div
							className={cn(
								"min-w-0 text-sm/[1.55]",
								isMine ? "bg-ink text-paper" : "border border-rule bg-paper-raised text-ink",
								(isMine ? OUTGOING_BUBBLE_RADIUS : INCOMING_BUBBLE_RADIUS)[clusterPosition],
								// An image sits to the bubble's edge with a hairline of
								// padding; text needs the full inset.
								message.attachment ? "p-[5px]" : "px-3.5 py-2",
							)}
						>
							{message.replyTo && (
								<div className={cn(message.attachment && "px-2 pb-1.5 pt-1")}>
									<MessageReplyQuote
										replyTo={message.replyTo}
										isMine={isMine}
										onJumpToOriginal={onJumpToReplyOriginal}
									/>
								</div>
							)}
							{message.attachment && (
								<MessageAttachment
									attachment={message.attachment}
									caption={message.content}
									isMine={isMine}
									clusterPosition={clusterPosition}
								/>
							)}
							{/* Skipped entirely for an image with no caption, so the bubble
							    does not carry an empty line under the picture. */}
							{message.content && (
								<p
									className={cn(
										"whitespace-pre-wrap wrap-break-word",
										message.attachment && "px-2.5 pb-1 pt-2.5",
									)}
								>
									{message.content}
								</p>
							)}
						</div>
					)}

					{hasReactions && (
						<MessageReactions
							reactions={message.reactions}
							currentUserId={currentUserId}
							users={participants}
							isMine={isMine}
							onToggle={onToggleReaction}
						/>
					)}
				</div>

				{!isEditing && (
					<MessageActions
						{...(canModify && { onEdit: onStartEdit, onDeleteForEveryone })}
						onDeleteForMe={onDeleteForMe}
						// Both omitted on a tombstone: there is nothing left to answer or to
						// mark, and the server refuses either write anyway.
						{...(!isDeleted && { onReply, onToggleReaction })}
						reactedKinds={reactedKinds}
						authorActionExpiresAt={message.authorActionExpiresAt}
						align={isMine ? "end" : "start"}
					/>
				)}

				{/* The gutter. It reserves its width whether or not anything in it is
				    currently shown, which is the entire trick: revealing a timestamp
				    on hover cannot reflow the bubble it belongs to. */}
				<div
					className={cn(
						"flex shrink-0 items-center gap-2",
						"max-sm:absolute max-sm:top-full max-sm:mt-1",
						isMine ? "max-sm:right-0" : "max-sm:left-10",
						!isTimeAlwaysVisible && !isEdited && "max-sm:hidden",
					)}
				>
					{isEdited && (
						<Button
							variant="ghost"
							onClick={onShowHistory}
							className="eyebrow border-b border-dotted border-ink-faint px-0 py-0 text-ink-faint hover:bg-transparent hover:text-ink-soft"
						>
							{EDITED_MESSAGE_LABEL}
						</Button>
					)}
					<span
						className={cn(
							"meta text-ink-faint transition-opacity",
							!isTimeAlwaysVisible && "opacity-0 group-hover:opacity-100",
						)}
					>
						{formatMessageTime(message.createdAt)}
					</span>
					{receipt && (
						<span className="inline-flex items-center gap-1">
							<CheckCheck
								aria-label={isGroup ? `Seen by ${receipt.readerCount}` : "Seen"}
								className="size-3.5 text-signal"
							/>
							{isGroup && <span className="meta text-signal">{receipt.readerCount}</span>}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
