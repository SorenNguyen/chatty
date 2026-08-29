import type { ConversationDTO } from "@chatty/shared-types";
import { Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { AVATAR_SIZE_CLASSES } from "@/constants/avatar-sizes";
import type { AvatarSize } from "@/types/avatar";
import { cn } from "@/utils/cn";
import { getDirectPeer } from "../utils";

interface ConversationAvatarProps {
	conversation: ConversationDTO;
	currentUserId: string;
	/** Ids currently online. A group shows no presence mark, so this only affects 1-1 rows. */
	onlineUserIds: Set<string>;
	size?: AvatarSize;
}

/**
 * The picture for a conversation row.
 *
 * A 1-1 is the other person's avatar, with their presence mark. A group gets a
 * neutral icon rather than one member's face — picking a member would be
 * arbitrary, and their presence would read as the group's.
 *
 * The group square is ink-filled where a person's is a pale tint, so the two
 * kinds of row are tellable apart down a sidebar without reading either label.
 *
 * The icon is sized from the same map the avatar uses, rather than a second
 * copy of the numbers: a sidebar mixing groups and direct chats has to keep one
 * column of text, and two maps drift the first time one of them is edited.
 */
export function ConversationAvatar({
	conversation,
	currentUserId,
	onlineUserIds,
	size = "md",
}: ConversationAvatarProps) {
	const peer = getDirectPeer(conversation, currentUserId);

	if (!peer) {
		return (
			<span
				aria-hidden="true"
				className={cn("flex shrink-0 items-center justify-center rounded-md bg-ink", AVATAR_SIZE_CLASSES[size])}
			>
				<Users className="size-1/2 text-paper" strokeWidth={1.75} />
			</span>
		);
	}

	return <Avatar user={peer} size={size} isOnline={onlineUserIds.has(peer.id)} />;
}
