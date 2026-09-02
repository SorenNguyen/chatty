import type { ConversationDTO } from "@chatty/shared-types";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { MAX_UNREAD_BADGE_COUNT } from "../constants/conversation-list";
import { EMPTY_CONVERSATION_TEXT } from "../constants/message";
import { formatConversationTime, getConversationPreview, getConversationTitle } from "../utils";
import { ConversationAvatar } from "./conversation-avatar";
import { useInfiniteScroll } from "../hooks/use-infinite-scroll";
import type { ConversationPaging } from "../types/conversation-paging";
import { ConversationActions } from "./conversation-actions";

interface ConversationListProps {
	conversations: ConversationDTO[];
	currentUserId: string;
	selectedConversationId: string | null;
	onlineUserIds: Set<string>;
	onSelect: (conversationId: string) => void;
	typingByConversation: Record<string, string[]>;
	paging: ConversationPaging;
}

export function ConversationList({
	conversations,
	currentUserId,
	selectedConversationId,
	onlineUserIds,
	onSelect,
	typingByConversation,
	paging,
}: ConversationListProps) {
	const loadMoreRef = useInfiniteScroll<HTMLLIElement>(paging.hasMore, paging.isLoadingMore, paging.loadMore);

	if (conversations.length === 0) {
		return (
			<p className="px-5 py-6 text-[13px] text-ink-faint">
				No conversations yet. Find someone above to start one.
			</p>
		);
	}

	return (
		<ul className="flex flex-col gap-0.5 px-2 pb-2">
			{conversations.map((conversation) => {
				const hasUnread = conversation.unreadCount > 0;
				const isSelected = conversation.id === selectedConversationId;
				const lastMessage = conversation.lastMessage;
				const isLastMessageMine = lastMessage?.author?.id === currentUserId;
				// Only in groups, and only in mono: it is a handle, not a name.
				const authorHandle =
					conversation.isGroup && lastMessage?.kind === "user" ? (lastMessage.author?.handle ?? null) : null;
				const isSomeoneTyping = (typingByConversation[conversation.id] ?? []).some(
					(userId) => userId !== currentUserId,
				);
				const isMentioned = Boolean(lastMessage?.mentionedUserIds.includes(currentUserId) && hasUnread);

				return (
					<li key={conversation.id} className="group relative">
						<Button
							variant="ghost"
							onClick={() => onSelect(conversation.id)}
							// A conversation row is a full-width, left-aligned block, not a
							// centred action. twMerge lets these win over Button's defaults.
							className={cn(
								"relative w-full items-center justify-start gap-3 rounded-panel px-2.5 py-2 text-left font-normal",
								isSelected
									? "bg-paper-sunken hover:bg-paper-sunken"
									: isMentioned
										? "bg-signal-soft hover:bg-signal-soft"
										: "hover:bg-ink/[0.035]",
							)}
						>
							<ConversationAvatar
								conversation={conversation}
								currentUserId={currentUserId}
								onlineUserIds={onlineUserIds}
							/>

							{/* min-w-0 is what lets the truncation below actually happen:
							    a flex child defaults to min-width:auto and refuses to
							    shrink below its content. */}
							<span className="flex min-w-0 flex-1 items-center gap-2 pr-7">
								<span className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span
										className={cn(
											"truncate text-sm text-ink",
											hasUnread ? "font-bold" : isSelected ? "font-semibold" : "font-medium",
										)}
									>
										{getConversationTitle(conversation, currentUserId)}
									</span>

									<span className="flex min-w-0 items-center gap-1 text-[13px]">
										{isLastMessageMine && !isSomeoneTyping && (
											<span className={cn("shrink-0", hasUnread ? "text-ink" : "text-ink-faint")}>
												You:
											</span>
										)}
										{authorHandle && !isLastMessageMine && (
											<span className="shrink-0 text-ink-soft">{authorHandle}:</span>
										)}
										<span
											className={cn(
												"min-w-0 truncate",
												isSomeoneTyping
													? "font-medium text-live"
													: hasUnread
														? "font-medium text-ink"
														: "text-ink-faint",
											)}
										>
											{isSomeoneTyping
												? "Typing…"
												: lastMessage
													? getConversationPreview(lastMessage)
													: EMPTY_CONVERSATION_TEXT}
										</span>
										{lastMessage && !isSomeoneTyping && (
											<span className="meta shrink-0 text-ink-faint">
												· {formatConversationTime(conversation.updatedAt)}
											</span>
										)}
									</span>
								</span>

								{hasUnread && (
									<span
										// The number is spelled out for assistive tech because
										// "3" beside a name is only meaningful next to the badge
										// shape, which a screen reader does not convey.
										aria-label={`${conversation.unreadCount} unread messages${isMentioned ? ", including a mention" : ""}`}
										className="meta flex h-[17px] min-w-[17px] shrink-0 items-center justify-center rounded-full bg-signal px-1.5 font-semibold text-paper-raised transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
									>
										{isMentioned
											? "@"
											: conversation.unreadCount > MAX_UNREAD_BADGE_COUNT
												? `${MAX_UNREAD_BADGE_COUNT}+`
												: conversation.unreadCount}
									</span>
								)}
							</span>
						</Button>
						<ConversationActions conversation={conversation} currentUserId={currentUserId} />
					</li>
				);
			})}

			{/* The sentinel sits inside the list rather than after it, so the
			    sidebar's own scroll container is what it is measured against. */}
			{paging.hasMore && (
				<li ref={loadMoreRef} aria-hidden="true" className="py-3 text-center">
					<span className="meta text-ink-faint">{paging.isLoadingMore ? "Loading…" : ""}</span>
				</li>
			)}
		</ul>
	);
}
