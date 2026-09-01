import type { ConversationDTO } from "@chatty/shared-types";
import { cn } from "@/utils/cn";
import { getConversationPresence, getConversationTitle } from "../utils";
import { ConversationAvatar } from "./conversation-avatar";

interface ConversationDetailsIdentityProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onlineUserIds: Set<string>;
}

/**
 * Who the panel is about, before what it stores.
 *
 * The panel used to open straight onto a tab strip, so "Conversation details"
 * was the only thing on it naming the conversation — and that is the one label
 * that reads identically for every conversation in the app. Instagram opens its
 * chat info on the face, the name and the handle for the same reason: a list of
 * shared media is only legible once you know whose it is.
 *
 * Centred rather than run along the top edge as another row. The panel is a
 * place you arrive at deliberately, and the thing it is about should be the
 * thing the eye lands on — the tabs below are the navigation, not the subject.
 */
export function ConversationDetailsIdentity({
	conversation,
	currentUserId,
	onlineUserIds,
}: ConversationDetailsIdentityProps) {
	const { peer, isPeerOnline, peerStatus, onlineCount } = getConversationPresence(
		conversation,
		currentUserId,
		onlineUserIds,
	);

	return (
		<div className="flex shrink-0 flex-col items-center gap-3 border-b border-rule px-6 py-6 text-center">
			<ConversationAvatar
				conversation={conversation}
				currentUserId={currentUserId}
				onlineUserIds={onlineUserIds}
				size="lg"
			/>

			<div className="flex min-w-0 max-w-full flex-col items-center gap-1">
				<h3 className="max-w-full truncate text-[17px] font-semibold tracking-tight text-ink">
					{getConversationTitle(conversation, currentUserId)}
				</h3>

				{peer ? (
					<>
						<p className="meta max-w-full truncate text-ink-faint">@{peer.handle}</p>
						<p className={cn("eyebrow max-w-full truncate", isPeerOnline ? "text-live" : "text-ink-faint")}>
							{peerStatus}
						</p>
					</>
				) : (
					<p className="eyebrow text-ink-faint">
						{conversation.participants.length} members
						{onlineCount > 0 && <span className="text-live"> · {onlineCount} online</span>}
					</p>
				)}
			</div>
		</div>
	);
}
