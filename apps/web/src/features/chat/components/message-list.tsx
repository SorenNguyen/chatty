import type { MessageDTO, ParticipantDTO } from "@chatty/shared-types";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { MessageActions } from "./message-actions";
import { MessageAttachment } from "./message-attachment";
import { MessageEditor } from "./message-editor";
import { cn } from "@/utils/cn";
import { DELETED_AUTHOR_NAME, DELETED_MESSAGE_TEXT, EDITED_MESSAGE_LABEL } from "../constants/message";
import { useMessageScroll } from "../hooks";
import { formatMessageTime, getReadReceipt } from "../utils";

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
	/**
	 * Both write over HTTP and return once the server has accepted. Neither
	 * updates this list — the `message:updated` broadcast does, so the author
	 * sees their own change through the same path everyone else does.
	 */
	onEditMessage: (messageId: string, content: string) => void;
	onDeleteMessage: (messageId: string) => void;
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
	onEditMessage,
	onDeleteMessage,
}: MessageListProps) {
	// The scroll container lives here rather than in the page, so everything that
	// reads or writes scroll position sits in one component.
	const { containerRef, handleScroll } = useMessageScroll({ messages, hasMoreOlder, isLoadingOlder, onLoadOlder });
	const readReceipt = getReadReceipt(messages, participants, currentUserId, areReceiptsShared);
	// Which message is open for editing, by id rather than by index: a page of
	// older messages prepends and would shift every index under the editor.
	const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

	function handleSaveEdit(messageId: string, content: string) {
		setEditingMessageId(null);
		onEditMessage(messageId, content);
	}

	return (
		<div ref={containerRef} onScroll={handleScroll} className="h-full overflow-y-auto">
			{isLoadingOlder && <p className="py-3 text-center text-xs text-slate-500">Loading earlier messages…</p>}

			{!hasMoreOlder && messages.length > 0 && (
				<p className="py-3 text-center text-xs text-slate-400">This is the beginning of the conversation.</p>
			)}

			{messages.length === 0 ? (
				<p className="p-6 text-center text-sm text-slate-500">No messages yet. Say hello.</p>
			) : (
				<div className="flex flex-col gap-2 p-4">
					{messages.map((message, index) => {
						// "An added Binh", "Chi left the group". No author, no bubble, no
						// side — it is about the conversation rather than from anyone in
						// it, so it reads centred and out of the two columns.
						if (message.kind === "system") {
							return (
								<p key={message.id} className="py-1 text-center text-xs text-slate-500">
									{message.content}
								</p>
							);
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
							<div key={message.id} className={cn("flex flex-col", isMine ? "items-end" : "items-start")}>
								{/* `group` so the hover that reveals the actions is the whole
								    row rather than the buttons themselves, which are invisible
								    until it happens and so cannot be hovered first. */}
								<div
									className={cn(
										"group flex max-w-[70%] items-end gap-2",
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

									<div
										className={cn(
											"rounded-2xl px-3 py-2",
											isDeleted
												? "border border-dashed border-slate-300 bg-transparent text-slate-500"
												: isMine
													? "bg-blue-600 text-white"
													: "bg-slate-100 text-slate-900",
										)}
									>
										{/* Only in groups: in a 1-1 the header already names the one
										    person it could possibly be. A USER message with no
										    author is one whose writer deleted their account —
										    still theirs to have said, no longer theirs to be
										    named for. */}
										{!isMine && isGroup && isFirstOfRun && (
											<p className="mb-0.5 text-xs font-semibold text-slate-700">
												{author ? author.displayName : DELETED_AUTHOR_NAME}
											</p>
										)}

										{isDeleted ? (
											<p className="text-sm italic">{DELETED_MESSAGE_TEXT}</p>
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
													<div className={cn(message.content && "mb-1.5")}>
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
													<p className="whitespace-pre-wrap wrap-break-word text-sm">
														{message.content}
													</p>
												)}
											</>
										)}

										<p
											className={cn(
												"mt-1 text-[10px]",
												isDeleted || !isMine ? "text-slate-500" : "text-blue-100",
											)}
										>
											{formatMessageTime(message.createdAt)}
											{/* Not "edited at 14:12": the useful fact is that what
											    you are reading is not what was sent, and a second
											    timestamp beside the first mostly asks which is which. */}
											{message.editedAt && !isDeleted && ` · ${EDITED_MESSAGE_LABEL}`}
										</p>
									</div>

									{canModify && !isEditing && (
										<MessageActions
											onEdit={() => setEditingMessageId(message.id)}
											onDelete={() => onDeleteMessage(message.id)}
										/>
									)}
								</div>

								{readReceipt?.messageId === message.id && (
									<p className="mt-0.5 pr-1 text-[10px] text-slate-400">
										{isGroup ? `Seen by ${readReceipt.readerCount}` : "Seen"}
									</p>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
