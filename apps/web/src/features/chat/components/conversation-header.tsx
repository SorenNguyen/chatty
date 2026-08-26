import type { ConversationDTO } from "@chatty/shared-types";
import { UserCog } from "lucide-react";
import { Button } from "@/components/button";
import { getConversationTitle, getDirectPeer, getTypingMessage } from "../utils";
import { ConversationAvatar } from "./conversation-avatar";

interface ConversationHeaderProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onlineUserIds: Set<string>;
	typingUserIds: string[];
	/** Toggles the group members panel. Omitted for a direct conversation, which has no group settings to show. */
	onToggleGroupMembers?: () => void;
	isManagingGroup?: boolean;
}

export function ConversationHeader({
	conversation,
	currentUserId,
	onlineUserIds,
	typingUserIds,
	onToggleGroupMembers,
	isManagingGroup,
}: ConversationHeaderProps) {
	const peer = getDirectPeer(conversation, currentUserId);
	const typingMessage = getTypingMessage(typingUserIds, conversation.participants);
	// Typing wins over presence: someone typing is obviously online, and showing
	// both would flicker the line between two facts that say the same thing.
	const statusLine = typingMessage ?? (peer && onlineUserIds.has(peer.id) ? "Online" : null);

	return (
		<header className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
			<ConversationAvatar
				conversation={conversation}
				currentUserId={currentUserId}
				onlineUserIds={onlineUserIds}
				size="sm"
			/>

			<div className="min-w-0 flex-1">
				<h1 className="truncate text-sm font-semibold text-slate-900">
					{getConversationTitle(conversation, currentUserId)}
				</h1>
				{statusLine && <p className="truncate text-xs text-slate-500">{statusLine}</p>}
			</div>

			{conversation.isGroup && onToggleGroupMembers && (
				<Button
					variant="ghost"
					onClick={onToggleGroupMembers}
					aria-pressed={isManagingGroup}
					aria-label="Group members"
					className="px-2"
				>
					<UserCog className="size-4" />
				</Button>
			)}
		</header>
	);
}
