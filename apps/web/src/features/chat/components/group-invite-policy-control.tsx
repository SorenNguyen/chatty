import type { GroupInvitePolicy } from "@chatty/shared-types";
import { useState } from "react";
import { api } from "@/api/client";

interface GroupInvitePolicyControlProps {
	conversationId: string;
	policy: GroupInvitePolicy;
	isOwner: boolean;
}

/** The one owner-only group setting, kept separate from day-to-day admin tools. */
export function GroupInvitePolicyControl({ conversationId, policy, isOwner }: GroupInvitePolicyControlProps) {
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");

	async function changePolicy(nextPolicy: GroupInvitePolicy) {
		if (nextPolicy === policy) return;
		setIsSaving(true);
		setError("");
		try {
			await api.setGroupInvitePolicy(conversationId, nextPolicy);
		} catch (changeError) {
			setError((changeError as Error).message);
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="mt-4">
			<label htmlFor="group-invite-policy" className="eyebrow text-ink-faint">
				Who can add people
			</label>
			<select
				id="group-invite-policy"
				value={policy}
				disabled={!isOwner || isSaving}
				onChange={(event) => void changePolicy(event.target.value as GroupInvitePolicy)}
				className="mt-1.5 w-full rounded-control border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink disabled:cursor-not-allowed disabled:opacity-55"
			>
				<option value="everyone">Everyone</option>
				<option value="managers">Owners and admins</option>
			</select>
			{!isOwner && <p className="eyebrow mt-2 text-ink-faint">Only the owner can change this policy.</p>}
			{error && (
				<p role="alert" className="eyebrow mt-2 text-signal">
					{error}
				</p>
			)}
		</div>
	);
}
