import type { ConversationDTO } from "@chatty/shared-types";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { MAX_UNREAD_BADGE_COUNT } from "../constants/conversation-list";
import { formatConversationTime, getConversationTitle } from "../utils";
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
			<p className="px-6 py-8 text-sm text-ink-faint">No conversations yet. Find someone above to start one.</p>
		);
	}

	return (
		<ul className="flex flex-col">
			{conversations.map((conversation) => {
				const hasUnread = conversation.unreadCount > 0;
				const isSelected = conversation.id === selectedConversationId;

				return (
					<li key={conversation.id}>
						<Button
							variant="ghost"
							onClick={() => onSelect(conversation.id)}
							// A conversation row is a full-width, left-aligned block, not a
							// centred action. twMerge lets these win over Button's defaults.
							//
							// The selected row drops to the page ground rather than lighting
							// up: the sidebar is the raised surface, so a selected row that
							// gets *darker* reads as recessed — the panel you are looking
							// through rather than a highlight competing with the unread
							// badges beside it. The 2px signal bar carries the state.
							className={cn(
								"w-full items-stretch justify-start gap-0 rounded-none p-0 text-left font-normal hover:bg-transparent",
								isSelected ? "bg-paper" : "hover:bg-ink/3",
							)}
						>
							<span
								aria-hidden="true"
								className={cn("w-0.5 shrink-0", isSelected ? "bg-signal" : "bg-transparent")}
							/>

							<span className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-5">
								<ConversationAvatar
									conversation={conversation}
									currentUserId={currentUserId}
									onlineUserIds={onlineUserIds}
								/>

								{/* min-w-0 is what lets the truncation below actually happen:
								    a flex child defaults to min-width:auto and refuses to
								    shrink below its content. */}
								<span className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="flex items-baseline justify-between gap-2">
										<span
											className={cn(
												"min-w-0 truncate text-sm text-ink",
												hasUnread ? "font-bold" : "font-medium",
											)}
										>
											{getConversationTitle(conversation, currentUserId)}
										</span>
										{conversation.lastMessage && (
											<span
												className={cn(
													"meta shrink-0",
													isSelected ? "text-signal" : "text-ink-faint",
												)}
											>
												{formatConversationTime(conversation.lastMessage.createdAt)}
											</span>
										)}
									</span>

									<span className="flex items-center justify-between gap-2">
										<span
											className={cn(
												"min-w-0 truncate text-[0.8125rem]",
												hasUnread ? "font-medium text-ink" : "text-ink-faint",
											)}
										>
											{conversation.lastMessage?.content ?? "No messages yet"}
										</span>

										{hasUnread && (
											<span
												// The number is spelled out for assistive tech because
												// "3" beside a name is only meaningful next to the badge
												// shape, which a screen reader does not convey.
												aria-label={`${conversation.unreadCount} unread messages`}
												// A 3px-radius rectangle rather than a round pill, and
												// mono tabular inside it: 1, 12 and 99+ then occupy
												// predictable widths instead of shuffling the preview
												// text each time a count ticks over.
												className="meta flex h-4.25 min-w-4.25 shrink-0 items-center justify-center rounded-[3px] bg-signal px-1.5 font-semibold text-paper-raised"
											>
												{conversation.unreadCount > MAX_UNREAD_BADGE_COUNT
													? `${MAX_UNREAD_BADGE_COUNT}+`
													: conversation.unreadCount}
											</span>
										)}
									</span>
								</span>
							</span>
						</Button>
					</li>
				);
			})}
		</ul>
	);
}
