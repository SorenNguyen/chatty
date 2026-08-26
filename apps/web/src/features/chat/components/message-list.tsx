import type { MessageDTO, ParticipantDTO } from "@chatty/shared-types";
import { Avatar } from "@/components/avatar";
import { MessageAttachment } from "./message-attachment";
import { cn } from "@/utils/cn";
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
	hasMoreOlder: boolean;
	isLoadingOlder: boolean;
	onLoadOlder: () => void;
}

export function MessageList({
	messages,
	currentUserId,
	participants,
	isGroup,
	hasMoreOlder,
	isLoadingOlder,
	onLoadOlder,
}: MessageListProps) {
	// The scroll container lives here rather than in the page, so everything that
	// reads or writes scroll position sits in one component.
	const { containerRef, handleScroll } = useMessageScroll({ messages, hasMoreOlder, isLoadingOlder, onLoadOlder });
	const readReceipt = getReadReceipt(messages, participants, currentUserId);

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
						const isFirstOfRun = messages[index - 1]?.author?.id !== author?.id;

						return (
							<div key={message.id} className={cn("flex flex-col", isMine ? "items-end" : "items-start")}>
								<div className={cn("flex max-w-[70%] items-end gap-2", isMine && "flex-row-reverse")}>
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
											isMine ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-900",
										)}
									>
										{/* Only in groups: in a 1-1 the header already names the one
										    person it could possibly be. */}
										{!isMine && isGroup && isFirstOfRun && author && (
											<p className="mb-0.5 text-xs font-semibold text-slate-700">
												{author.displayName}
											</p>
										)}
										{message.attachment && (
											<div className={cn(message.content && "mb-1.5")}>
												<MessageAttachment
													attachment={message.attachment}
													caption={message.content}
												/>
											</div>
										)}
										{/* Skipped entirely for an image with no caption, so the
										    bubble does not carry an empty line under the picture. */}
										{message.content && (
											<p className="whitespace-pre-wrap wrap-break-word text-sm">
												{message.content}
											</p>
										)}
										<p
											className={cn(
												"mt-1 text-[10px]",
												isMine ? "text-blue-100" : "text-slate-500",
											)}
										>
											{formatMessageTime(message.createdAt)}
										</p>
									</div>
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
