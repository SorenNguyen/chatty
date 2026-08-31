import type { ParticipantDTO } from "@chatty/shared-types";
import { Crown, UserMinus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";

interface GroupMemberRowProps {
	participant: ParticipantDTO;
	isSelf: boolean;
	/** Whether the *viewer* owns the group — the two management buttons hang off it. */
	canManage: boolean;
	isPromoting: boolean;
	isRemoving: boolean;
	onMakeOwner: () => void;
	onRemove: () => void;
}

/**
 * One person in the group panel: their face, their name, and — for the owner
 * looking at somebody else — the two things they may do about them.
 *
 * Split out of `GroupMembersPanel` when that file went over the 300-line limit.
 * The panel keeps every piece of state and every request; this renders a row.
 */
export function GroupMemberRow({
	participant,
	isSelf,
	canManage,
	isPromoting,
	isRemoving,
	onMakeOwner,
	onRemove,
}: GroupMemberRowProps) {
	return (
		<li className="flex items-center gap-2.5 py-1">
			<Avatar user={participant} size="sm" />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="w-full truncate text-[13px] font-medium text-ink">
					{participant.displayName}
					{isSelf && <span className="font-normal text-ink-faint"> (you)</span>}
					{/* Who to ask, when the rename field is greyed out and the remove
					    buttons are not there. */}
					{participant.role === "owner" && (
						<span className="eyebrow ml-2 rounded-badge border border-rule px-1.5 py-0.5 text-ink-faint">
							Owner
						</span>
					)}
				</span>
				<span className="meta w-full truncate text-ink-faint">@{participant.handle}</span>
			</span>

			{/* No remove button on your own row — leaving has its own clearly-labelled
			    action below the list, so a small × next to your own name cannot be
			    clicked by accident. */}
			{!isSelf && canManage && (
				<>
					{/* Handing the group over costs the person pressing it their own
					    role, so it is spelled out in the label rather than left to the
					    crown to imply. */}
					<Button
						variant="ghost"
						onClick={onMakeOwner}
						disabled={isPromoting}
						aria-label={`Make ${participant.displayName} the group owner`}
						className="size-8 p-0"
					>
						<Crown className="size-4" />
					</Button>
					<Button
						variant="ghost"
						onClick={onRemove}
						disabled={isRemoving}
						aria-label={`Remove ${participant.displayName} from the group`}
						className="size-8 p-0"
					>
						<UserMinus className="size-4" />
					</Button>
				</>
			)}
		</li>
	);
}
