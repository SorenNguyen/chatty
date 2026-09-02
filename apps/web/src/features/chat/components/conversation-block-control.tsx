import type { UserDTO } from "@chatty/shared-types";
import { Ban } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface ConversationBlockControlProps {
	peer: UserDTO;
}

/**
 * Blocking, from the one place you already went to find out who you are talking
 * to.
 *
 * Direct conversations only. A block stops messages both ways and takes each
 * person out of the other's search, but it leaves a group they share alone —
 * the same line WhatsApp, Messenger and Telegram draw, and the reason the
 * control is here rather than on a group's member list.
 *
 * Blocking asks first and unblocking does not. That asymmetry is the point:
 * one of them is the decision, and making somebody confirm the way back out of
 * it just punishes changing your mind.
 */
export function ConversationBlockControl({ peer }: ConversationBlockControlProps) {
	const [isBlocked, setIsBlocked] = useState(false);
	const [isAsking, setIsAsking] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		let isCurrent = true;
		void api
			.listBlockedUsers()
			.then((blocked) => {
				if (isCurrent) setIsBlocked(blocked.some((user) => user.id === peer.id));
			})
			.catch(() => {
				// Leaves the control reading "Block", which is the safe way to be
				// wrong: the button is then a no-op the server refuses, rather than an
				// "Unblock" that quietly reopens contact somebody asked to end.
			});

		return () => {
			isCurrent = false;
		};
	}, [peer.id]);

	async function apply(shouldBlock: boolean) {
		setIsSaving(true);
		try {
			if (shouldBlock) await api.blockUser(peer.id);
			else await api.unblockUser(peer.id);
			setIsBlocked(shouldBlock);
		} finally {
			setIsSaving(false);
			setIsAsking(false);
		}
	}

	return (
		<div className="shrink-0 border-b border-rule px-6 py-4">
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
					// Says what it does *and* what it does not. "Blocked" reads as
					// total, and somebody who shares a group with this person would
					// otherwise find the exception out at the worst moment.
					body={`Neither of you will be able to message the other, and you will stop appearing in each other's search. Messages you have already exchanged stay, and groups you are both in are not affected.`}
					confirmLabel="Block"
					onConfirm={() => void apply(true)}
					onCancel={() => setIsAsking(false)}
				/>
			)}
		</div>
	);
}
