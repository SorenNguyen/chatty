import type { UserDTO } from "@chatty/shared-types";
import { Ban } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useBlockedUsers } from "../hooks/use-blocked-users";

interface ConversationBlockControlProps {
	peer: UserDTO;
}

/**
 * Blocking, at the foot of the panel about the person.
 *
 * **Placement is the decision here.** This sat directly under the name to begin
 * with, which made a red-outlined button the loudest thing on a panel whose job
 * is to show what a conversation holds — and `Button`'s `danger` variant is
 * outlined precisely so it does not invite the click. Every messenger puts block
 * at the bottom, after the content, and that is where it belongs: reachable
 * deliberately, not encountered on the way to the photos.
 *
 * Blocking asks first and unblocking does not. One of them is the decision;
 * making somebody confirm the way back out of it only punishes changing
 * their mind.
 */
export function ConversationBlockControl({ peer }: ConversationBlockControlProps) {
	const isBlocked = useBlockedUsers((state) => state.blockedIds.has(peer.id));
	const load = useBlockedUsers((state) => state.load);
	const block = useBlockedUsers((state) => state.block);
	const unblock = useBlockedUsers((state) => state.unblock);
	const [isAsking, setIsAsking] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		void load();
	}, [load]);

	async function apply(shouldBlock: boolean) {
		setIsSaving(true);
		try {
			await (shouldBlock ? block(peer.id) : unblock(peer.id));
		} finally {
			setIsSaving(false);
			setIsAsking(false);
		}
	}

	return (
		<div className="shrink-0 border-t border-rule px-6 py-4">
			<Button
				variant={isBlocked ? "outline" : "danger"}
				disabled={isSaving}
				onClick={() => (isBlocked ? void apply(false) : setIsAsking(true))}
				className="w-full"
			>
				<Ban className="size-4" />
				{isBlocked ? `Unblock ${peer.displayName}` : `Block ${peer.displayName}`}
			</Button>

			{isAsking && (
				<ConfirmDialog
					title={`Block ${peer.displayName}?`}
					// Says what it does *and* what it does not. "Blocked" reads as total,
					// and somebody who shares a group with this person would otherwise
					// find the exception out at the worst moment.
					body={`Neither of you will be able to message the other, and you will stop appearing in each other's search. Messages you have already exchanged stay, and groups you are both in are not affected.`}
					confirmLabel="Block"
					onConfirm={() => void apply(true)}
					onCancel={() => setIsAsking(false)}
				/>
			)}
		</div>
	);
}
