import type { ConversationDTO } from "@chatty/shared-types";
import { Search, Users } from "lucide-react";
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
}

export function ConversationHeader({
	conversation,
	currentUserId,
	onlineUserIds,
	typingUserIds,
	onToggleGroupMembers,
	isManagingGroup,
	onOpenMessageSearch,
}: ConversationHeaderProps) {
	const peer = getDirectPeer(conversation, currentUserId);
	const typingMessage = getTypingMessage(typingUserIds, conversation.participants);
	const isPeerOnline = Boolean(peer && onlineUserIds.has(peer.id));
	// Typing wins over presence: someone typing is obviously online, and showing
	// both would flicker the line between two facts that say the same thing.
	const statusLine = typingMessage ?? (isPeerOnline ? "Online" : formatLastSeen(peer?.lastSeenAt ?? null));

	return (
		<header className="flex h-17.5 shrink-0 items-center gap-3 border-b border-rule bg-paper-raised px-6">
			<ConversationAvatar
				conversation={conversation}
				currentUserId={currentUserId}
				onlineUserIds={onlineUserIds}
				size="sm"
			/>

			<div className="min-w-0 flex-1">
				<h1 className="truncate text-[0.9375rem] font-semibold text-ink">
					{getConversationTitle(conversation, currentUserId)}
				</h1>

				{statusLine && (
					<p className="mt-0.5 flex items-center gap-1.5">
						{/* Three shrinking squares while someone types, one square for a
						    settled presence. The squares are drawn rather than iconified
						    because they are a state read from numbers, not a picture of a
						    thing — the same reason a progress bar is not an icon. */}
						{typingMessage ? (
							<span aria-hidden="true" className="flex shrink-0 gap-0.5">
								<span className="size-0.75 bg-signal" />
								<span className="size-0.75 bg-signal/50" />
								<span className="size-0.75 bg-signal/25" />
							</span>
						) : (
							<span
								aria-hidden="true"
								className={cn("size-1.5 shrink-0", isPeerOnline ? "bg-live" : "bg-ink-faint")}
							/>
						)}
						<span className={cn("eyebrow truncate", typingMessage ? "text-signal" : "text-ink-faint")}>
							{statusLine}
						</span>
					</p>
				)}
			</div>

			{onOpenMessageSearch && (
				<Button
					variant="ghost"
					onClick={onOpenMessageSearch}
					aria-label="Search in conversation"
					className="size-8 rounded-md p-0"
				>
					<Search className="size-4" strokeWidth={1.75} />
				</Button>
			)}

			{conversation.isGroup && onToggleGroupMembers && (
				<Button
					variant="ghost"
					onClick={onToggleGroupMembers}
					aria-pressed={isManagingGroup}
					aria-label="Group members"
					className={cn("size-8 rounded-md p-0", isManagingGroup && "bg-ink/8 text-ink")}
				>
					<Users className="size-4" strokeWidth={1.75} />
				</Button>
			)}
		</header>
	);
}
