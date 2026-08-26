import type { ConversationDTO } from "@chatty/shared-types";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { MAX_UNREAD_BADGE_COUNT } from "../constants/conversation-list";
import { getConversationTitle } from "../utils";
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
			<p className="px-4 py-6 text-sm text-slate-500">No conversations yet. Find someone above to start one.</p>
		);
	}

	return (
		<ul className="flex flex-col">
			{conversations.map((conversation) => {
				const hasUnread = conversation.unreadCount > 0;

				return (
					<li key={conversation.id}>
						<Button
							variant="ghost"
							onClick={() => onSelect(conversation.id)}
							// A conversation row is a full-width, left-aligned block, not a
							// centred action. twMerge lets these win over Button's defaults.
							className={cn(
								"w-full items-center justify-start gap-3 rounded-none border-b border-slate-100 px-4 py-3 text-left",
								conversation.id === selectedConversationId
									? "bg-blue-50 hover:bg-blue-50"
									: "hover:bg-slate-50",
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
							<span className="flex min-w-0 flex-1 flex-col">
								<span
									className={cn(
										"w-full truncate text-sm text-slate-900",
										hasUnread ? "font-semibold" : "font-medium",
									)}
								>
									{getConversationTitle(conversation, currentUserId)}
								</span>
								<span
									className={cn(
										"w-full truncate text-xs font-normal",
										hasUnread ? "text-slate-700" : "text-slate-500",
									)}
								>
									{conversation.lastMessage?.content ?? "No messages yet"}
								</span>
							</span>

							{hasUnread && (
								<span
									// The number is spelled out for assistive tech because
									// "3" beside a name is only meaningful next to the badge
									// shape, which a screen reader does not convey.
									aria-label={`${conversation.unreadCount} unread messages`}
									className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[11px] font-semibold text-white"
								>
									{conversation.unreadCount > MAX_UNREAD_BADGE_COUNT
										? `${MAX_UNREAD_BADGE_COUNT}+`
										: conversation.unreadCount}
								</span>
							)}
						</Button>
					</li>
				);
			})}
		</ul>
	);
}
