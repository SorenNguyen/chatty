import type { ConversationDTO } from "@chatty/shared-types";
import { ArrowLeft, PanelRight, Search } from "lucide-react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { formatLastSeen, getConversationTitle, getDirectPeer, getTypingMessage } from "../utils";
import { ConversationAvatar } from "./conversation-avatar";

interface ConversationHeaderProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onlineUserIds: Set<string>;
	typingUserIds: string[];
	/** Toggles the group members panel. Omitted for a direct conversation, which has no group settings to show. */
	onToggleGroupMembers?: () => void;
	isManagingGroup?: boolean;
	onOpenMessageSearch?: () => void;
	onBack?: () => void;
}

/**
 * Who you are talking to, and the one line that says where they are.
 *
 * Presence is already shown on the avatar, so a direct conversation's status
 * line stays compact and uses text alone.
 */
export function ConversationHeader({
	conversation,
	currentUserId,
	onlineUserIds,
	typingUserIds,
	onToggleGroupMembers,
	isManagingGroup,
	onOpenMessageSearch,
	onBack,
}: ConversationHeaderProps) {
	const peer = getDirectPeer(conversation, currentUserId);
	// Typing wins over presence: someone typing is obviously online, and showing
	// both would flicker the line between two facts that say the same thing.
	const typingMessage = getTypingMessage(typingUserIds, conversation.participants);
	const isPeerOnline = Boolean(peer && onlineUserIds.has(peer.id));
	const lastSeen = formatLastSeen(peer?.lastSeenAt ?? null);
	const onlineCount = conversation.participants.filter((participant) => onlineUserIds.has(participant.id)).length;

	return (
		<header className="flex h-[70px] shrink-0 items-center gap-3 border-b border-rule bg-paper-raised px-4 sm:px-5 md:px-7">
			{onBack && (
				<Button
					variant="ghost"
					onClick={onBack}
					aria-label="Back to conversations"
					className="-ml-2 size-8 shrink-0 p-0 md:hidden"
				>
					<ArrowLeft className="size-4" />
				</Button>
			)}
			<ConversationAvatar
				conversation={conversation}
				currentUserId={currentUserId}
				onlineUserIds={onlineUserIds}
				size="sm"
			/>

			{/*
				The text column is boxed to the avatar's own 32px — an 18px name line
				over a 14px status line, no gap between them. Left to their natural
				leading the pair ran to about 38px, so the block stood taller than the
				face beside it and the two stopped reading as one unit. Both numbers are
				fixed rather than derived: `eyebrow` is 10px at 1.4, and the name has to
				make up the remainder exactly or the column drifts off the avatar again.
			*/}
			<div className="flex min-w-0 flex-1 flex-col justify-center">
				<h1 className="truncate text-[15px] font-semibold leading-[18px] tracking-tight text-ink">
					{getConversationTitle(conversation, currentUserId)}
				</h1>

				<div className="flex h-[14px] items-center gap-2">
					{typingMessage ? (
						<>
							<span aria-hidden="true" className="flex shrink-0 gap-0.5">
								<span className="size-[3px] bg-signal" />
								<span className="size-[3px] bg-signal opacity-50" />
								<span className="size-[3px] bg-signal opacity-25" />
							</span>
							<span className="eyebrow truncate text-signal">{typingMessage}</span>
						</>
					) : conversation.isGroup ? (
						<>
							<span className="eyebrow text-ink-faint">{conversation.participants.length} members</span>
							{onlineCount > 0 && (
								<>
									<span aria-hidden="true" className="h-2.5 w-px bg-rule" />
									<span className="eyebrow text-live">{onlineCount} online</span>
								</>
							)}
						</>
					) : (
						<span className={cn("eyebrow truncate", isPeerOnline ? "text-live" : "text-ink-faint")}>
							{isPeerOnline ? "Online" : (lastSeen ?? "Last seen hidden")}
						</span>
					)}
				</div>
			</div>

			{onOpenMessageSearch && (
				<Button
					variant="ghost"
					onClick={onOpenMessageSearch}
					aria-label="Search in conversation"
					className="size-8 shrink-0 p-0"
				>
					<Search className="size-4" />
				</Button>
			)}

			{onToggleGroupMembers && (
				<Button
					variant="ghost"
					onClick={onToggleGroupMembers}
					aria-pressed={isManagingGroup}
					aria-label={conversation.isGroup ? "Group members" : "Conversation storage and details"}
					className={cn("size-8 shrink-0 p-0", isManagingGroup && "bg-ink/5 text-ink")}
				>
					<PanelRight className="size-4" />
				</Button>
			)}
		</header>
	);
}
