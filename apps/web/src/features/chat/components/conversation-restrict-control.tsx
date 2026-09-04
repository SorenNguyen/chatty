import type { UserDTO } from "@chatty/shared-types";
import { EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/button";
import { useRestrictedUsers } from "@/hooks/use-restricted-users";

interface ConversationRestrictControlProps {
	peer: UserDTO;
}

/**
 * Restricting, beside the block control it shares a panel with.
 *
 * No confirm dialog, unlike `ConversationBlockControl` — asking first is for a
 * decision the other person will notice. A restriction is quiet by design (see
 * `restrictions.service.ts`): it changes nothing this person can observe, so
 * there is nothing here that needs a second click to undo.
 */
export function ConversationRestrictControl({ peer }: ConversationRestrictControlProps) {
	const isRestricted = useRestrictedUsers((state) => state.restrictedIds.has(peer.id));
	const load = useRestrictedUsers((state) => state.load);
	const restrict = useRestrictedUsers((state) => state.restrict);
	const unrestrict = useRestrictedUsers((state) => state.unrestrict);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		void load(peer.id);
	}, [load, peer.id]);

	async function toggle() {
		if (isSaving) return;
		setIsSaving(true);
		setError("");
		try {
			await (isRestricted ? unrestrict(peer.id) : restrict(peer.id));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not update restriction settings");
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="shrink-0 border-t border-rule px-6 py-4">
			<Button variant="outline" disabled={isSaving} onClick={() => void toggle()} className="w-full">
				<EyeOff className="size-4" />
				{isRestricted ? `Stop restricting ${peer.displayName}` : `Restrict ${peer.displayName}`}
			</Button>

			{error && (
				<p role="alert" className="mt-2 text-[13px] text-signal">
					{error}
				</p>
			)}
		</div>
	);
}
