import type { MessageDTO, ParticipantDTO } from "@chatty/shared-types";
import { useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { MessageActions } from "./message-actions";
import { MessageAttachment } from "./message-attachment";
import { MessageEditor } from "./message-editor";
import { MessageEditHistory } from "./message-edit-history";
import { MessageMeta } from "./message-meta";
import { SystemMessageLine } from "./system-message-line";
import { cn } from "@/utils/cn";
import { DELETED_AUTHOR_NAME, DELETED_MESSAGE_TEXT } from "../constants/message";
import { useMessageScroll } from "../hooks";
import { getReadReceipt } from "../utils";

interface MessageListProps {
	messages: MessageDTO[];
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
	targetMessageId?: string | null;
	onReturnToLatest?: () => void;
}

export function MessageList({
	messages,
	currentUserId,
	participants,
	isGroup,
	areReceiptsShared,
	hasMoreOlder,
	isLoadingOlder,
	onLoadOlder,
	hasMoreNewer,
	isLoadingNewer,
	onLoadNewer,
	onEditMessage,
	onDeleteMessage,
	onHideMessage,
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
		<div ref={containerRef} onScroll={handleScroll} className="h-full overflow-y-auto">
			{targetMessageId && onReturnToLatest && (
				<div className="sticky top-3 z-10 flex justify-center">
					<Button
						variant="outline"
						onClick={onReturnToLatest}
						className="eyebrow border-rule bg-paper-raised px-3 py-2 text-ink-soft shadow-sm"
					>
						Return to latest messages
					</Button>
				</div>
			)}
			{isLoadingOlder && <p className="eyebrow py-4 text-center text-ink-faint">Loading earlier messages…</p>}

			{!hasMoreOlder && messages.length > 0 && (
				<p className="eyebrow py-4 text-center text-ink-faint">This is the beginning of the conversation.</p>
			)}

			{messages.length === 0 ? (
				<p className="p-8 text-center text-sm text-ink-faint">No messages yet. Say hello.</p>
			) : (
				<div className="flex flex-col gap-4 px-6 py-5">
					{messages.map((message, index) => {
						if (message.kind === "system") {
							return <SystemMessageLine key={message.id} content={message.content} />;
						}

						const author = message.author;
						const isMine = author?.id === currentUserId;
						// One avatar per run of messages from the same person. Repeating it
						// on every line turns a paragraph typed in three bursts into three
						// faces stacked down the margin. A system line between two of
						// someone's messages breaks the run, which is what makes the
						// avatar reappear underneath it rather than leaving a bare bubble.
						//
						// An authorless message never continues a run, and never starts one
						// anything else can join: two deleted accounts are not one person,
						// and comparing `undefined` to `undefined` would say they were.
						const isFirstOfRun = !author || messages[index - 1]?.author?.id !== author.id;
						const isDeleted = Boolean(message.deletedAt);
						const isEditing = editingMessageId === message.id;
						// A tombstone has no content and no image left to change, so the
						// two actions have nothing to act on — the row stays only to hold
						// its place in the order.
						const canModify = isMine && !isDeleted;

						return (
							<div
								id={`message-${message.id}`}
								key={message.id}
								className={cn(
									"flex flex-col rounded-md transition",
									// The one place signal-soft fills a surface: a searched-for
									// message is the thing you asked to be shown, so it earns
									// the same colour the unread badge uses.
									message.id === targetMessageId && "bg-signal-soft ring-4 ring-signal-soft",
									isMine ? "items-end" : "items-start",
								)}
							>
								{/* `group` so the hover that reveals the actions is the whole
								    row rather than the buttons themselves, which are invisible
								    until it happens and so cannot be hovered first. */}
								<div
									className={cn(
										"group flex max-w-[70%] items-end gap-3",
										isMine && "flex-row-reverse",
									)}
								>
									{/* The spacer keeps a run's later bubbles aligned with its
									    first one; without it they slide under the avatar. */}
									{!isMine &&
										(isFirstOfRun && author ? (
											<Avatar user={author} size="sm" />
										) : (
											<span className="size-8 shrink-0" />
										))}

									<div className="flex min-w-0 flex-col gap-1.5">
										{/* Only in groups: in a 1-1 the header already names the one
										    person it could possibly be. A USER message with no
										    author is one whose writer deleted their account —
										    still theirs to have said, no longer theirs to be
										    named for. */}
										{!isMine && isGroup && isFirstOfRun && (
											<p className="eyebrow text-ink-soft">
												{author ? author.displayName : DELETED_AUTHOR_NAME}
											</p>
										)}

										<div
											className={cn(
												"px-4 py-2.5",
												isDeleted
													? "notch-theirs border border-dashed border-rule text-ink-faint"
													: isMine
														? "notch-mine bg-ink text-paper"
														: "notch-theirs border border-rule bg-paper-raised text-ink",
											)}
										>
											{isDeleted ? (
												<p className="flex items-center gap-2 text-[0.8125rem]">
													<Ban className="size-3.5 shrink-0" strokeWidth={1.75} />
													{DELETED_MESSAGE_TEXT}
												</p>
											) : isEditing ? (
												<MessageEditor
													initialContent={message.content}
													hasAttachment={Boolean(message.attachment)}
													onSave={(content) => handleSaveEdit(message.id, content)}
													onCancel={() => setEditingMessageId(null)}
												/>
											) : (
												<>
													{message.attachment && (
														<div className={cn(message.content && "mb-2")}>
															<MessageAttachment
																attachment={message.attachment}
																caption={message.content}
															/>
														</div>
													)}
													{/* Skipped entirely for an image with no caption, so
													    the bubble does not carry an empty line under
													    the picture. */}
													{message.content && (
														<p className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed">
															{message.content}
														</p>
													)}
												</>
											)}
										</div>

										<MessageMeta
											createdAt={message.createdAt}
											editedAt={message.editedAt}
											isDeleted={isDeleted}
											isMine={isMine}
											onOpenHistory={() => setHistoryMessageId(message.id)}
										/>
									</div>

									{!isEditing && (
										<MessageActions
											{...(canModify && {
												onEdit: () => setEditingMessageId(message.id),
												onDeleteForEveryone: () => onDeleteMessage(message.id),
											})}
											onDeleteForMe={() => onHideMessage(message.id)}
											authorActionExpiresAt={message.authorActionExpiresAt}
											align={isMine ? "end" : "start"}
										/>
									)}
								</div>

								{readReceipt?.messageId === message.id && (
									<p className="eyebrow mt-1 pr-1 text-signal">
										{isGroup ? `Seen by ${readReceipt.readerCount}` : "Seen"}
									</p>
								)}
							</div>
						);
					})}
					{hasMoreNewer && (
						<div className="pb-2 pt-1 text-center">
							<Button
								variant="outline"
								onClick={onLoadNewer}
								disabled={isLoadingNewer}
								className="eyebrow border-rule bg-paper-raised px-3 py-2 text-ink-soft"
							>
								{isLoadingNewer ? "Loading newer messages…" : "Load newer messages"}
							</Button>
						</div>
					)}
				</div>
			)}
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
