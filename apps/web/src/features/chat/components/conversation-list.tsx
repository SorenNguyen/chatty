import type { ConversationDTO } from "@chatty/shared-types";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { MAX_UNREAD_BADGE_COUNT } from "../constants/conversation-list";
import { EMPTY_CONVERSATION_TEXT } from "../constants/message";
import { formatConversationTime, getConversationPreview, getConversationTitle } from "../utils";
import { ConversationAvatar } from "./conversation-avatar";

interface ConversationListProps {
	conversations: ConversationDTO[];
	currentUserId: string;
	selectedConversationId: string | null;
	onlineUserIds: Set<string>;
	onSelect: (conversationId: string) => void;
}

export function ConversationList({
	conversations,
	currentUserId,
	selectedConversationId,
	onlineUserIds,
	onSelect,
}: ConversationListProps) {
	if (conversations.length === 0) {
		return (
			<p className="px-5 py-6 text-[13px] text-ink-faint">
				No conversations yet. Find someone above to start one.
			</p>
		);
	}

	return (
		<ul className="flex flex-col">
			{conversations.map((conversation) => {
				const hasUnread = conversation.unreadCount > 0;
				const isSelected = conversation.id === selectedConversationId;
				const lastMessage = conversation.lastMessage;
				// A double tick beside your own last line, the same mark the thread
				// uses. Nobody needs telling who wrote the message they are looking
				// at; they do need telling which rows are waiting on them.
				const isLastMessageMine = lastMessage?.author?.id === currentUserId;
				// Only in groups, and only in mono: it is a handle, not a name.
				const authorHandle =
					conversation.isGroup && lastMessage?.kind === "user" ? (lastMessage.author?.handle ?? null) : null;

				return (
					<li key={conversation.id}>
						<Button
							variant="ghost"
							onClick={() => onSelect(conversation.id)}
							// A conversation row is a full-width, left-aligned block, not a
							// centred action. twMerge lets these win over Button's defaults.
							className={cn(
								"relative w-full items-center justify-start gap-3 rounded-none py-3.5 pl-5 pr-4 text-left font-normal",
								isSelected ? "bg-paper hover:bg-paper" : "hover:bg-ink/[0.03]",
							)}
						>
							{/* The only permanent mark of the signal colour on this screen:
							    the conversation you are in. */}
							{isSelected && (
								<span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-signal" />
							)}

							<ConversationAvatar
								conversation={conversation}
								currentUserId={currentUserId}
								onlineUserIds={onlineUserIds}
							/>

							{/* min-w-0 is what lets the truncation below actually happen:
							    a flex child defaults to min-width:auto and refuses to
							    shrink below its content. */}
							<span className="flex min-w-0 flex-1 flex-col gap-1">
								<span className="flex items-baseline justify-between gap-2">
									<span
										className={cn(
											"truncate text-sm text-ink",
											hasUnread ? "font-bold" : isSelected ? "font-semibold" : "font-medium",
										)}
									>
										{getConversationTitle(conversation, currentUserId)}
									</span>
									<span className={cn("meta shrink-0", hasUnread ? "text-signal" : "text-ink-faint")}>
										{lastMessage ? formatConversationTime(conversation.updatedAt) : ""}
									</span>
								</span>

								<span className="flex items-center justify-between gap-2">
									<span className="flex min-w-0 items-center gap-1.5">
										{isLastMessageMine && (
											<CheckCheck aria-hidden="true" className="size-3 shrink-0 text-ink-faint" />
										)}
										{authorHandle && !isLastMessageMine && (
											<span className="meta shrink-0 text-ink-soft">{authorHandle}</span>
										)}
										<span
											className={cn(
												"truncate text-[13px]",
												hasUnread ? "font-medium text-ink" : "text-ink-faint",
											)}
										>
											{lastMessage
												? getConversationPreview(lastMessage)
												: EMPTY_CONVERSATION_TEXT}
										</span>
									</span>

									{hasUnread && (
										<span
											// The number is spelled out for assistive tech because
											// "3" beside a name is only meaningful next to the badge
											// shape, which a screen reader does not convey.
											aria-label={`${conversation.unreadCount} unread messages`}
											className="meta flex h-[17px] min-w-[17px] shrink-0 items-center justify-center rounded-badge bg-signal px-1.5 font-semibold text-paper-raised"
										>
											{conversation.unreadCount > MAX_UNREAD_BADGE_COUNT
												? `${MAX_UNREAD_BADGE_COUNT}+`
												: conversation.unreadCount}
										</span>
									)}
								</span>
							</span>
						</Button>
					</li>
				);
			})}
		</ul>
	);
}
