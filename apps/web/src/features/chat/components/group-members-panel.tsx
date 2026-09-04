import type { ConversationDTO, ConversationRole, UserDTO } from "@chatty/shared-types";
import { useEffect, useState } from "react";
import { LogOut, X } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TextField } from "@/components/text-field";
import { cn } from "@/utils/cn";
import { GroupInvitePolicyControl } from "./group-invite-policy-control";
import { GroupMemberSearch } from "./group-member-search";
import { GroupMemberRow } from "./group-member-row";

interface GroupMembersPanelProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onClose: () => void;
	isEmbedded?: boolean;
}

/**
 * Rename, member list, and add/remove — everything item 8 needs, in one
 * inline panel rather than a modal. The app has no modal/dialog primitive
 * declared anywhere in its conventions, and `NewConversationPanel` already
 * establishes the pattern this follows: render inline, don't invent one.
 *
 * Owners and admins moderate day-to-day activity; only the owner can delegate
 * roles and choose who may invite. Every member can always leave. See ADR 0018.
 */
export function GroupMembersPanel({
	conversation,
	currentUserId,
	onClose,
	isEmbedded = false,
}: GroupMembersPanelProps) {
	const [nameDraft, setNameDraft] = useState(conversation.name ?? "");
	const [isSavingName, setIsSavingName] = useState(false);
	const [nameError, setNameError] = useState("");
	const [removingUserId, setRemovingUserId] = useState<string | null>(null);
	const [promotingUserId, setPromotingUserId] = useState<string | null>(null);
	const [changingRoleUserId, setChangingRoleUserId] = useState<string | null>(null);
	const [isLeaving, setIsLeaving] = useState(false);
	const [actionError, setActionError] = useState("");
	// Who is about to be removed, and whether leaving is about to happen. Both
	// hold the *pending* decision — the action runs when the dialog confirms it,
	// which is the whole point of asking.
	const [memberPendingRemoval, setMemberPendingRemoval] = useState<UserDTO | null>(null);
	const [isConfirmingLeave, setIsConfirmingLeave] = useState(false);

	const currentRole = conversation.participants.find((participant) => participant.id === currentUserId)?.role;
	const isOwner = currentRole === "owner";
	const isAdmin = currentRole === "admin";
	const canModerate = isOwner || isAdmin;
	const canInvite = conversation.invitePolicy === "everyone" || canModerate;

	// Someone else can rename the group while this panel is open — `conversation`
	// is a prop fed by the live `conversation:updated` event, so the draft
	// follows it rather than freezing at whatever the name was on open.
	useEffect(() => {
		setNameDraft(conversation.name ?? "");
	}, [conversation.name]);

	async function handleSaveName() {
		const trimmed = nameDraft.trim();
		if (!trimmed || trimmed === conversation.name) return;

		setIsSavingName(true);
		setNameError("");
		try {
			await api.renameConversation(conversation.id, trimmed);
		} catch (renameError) {
			setNameError((renameError as Error).message);
		} finally {
			setIsSavingName(false);
		}
	}

	async function handleRemoveMember(userId: string) {
		setMemberPendingRemoval(null);
		setRemovingUserId(userId);
		setActionError("");
		try {
			await api.removeParticipant(conversation.id, userId);
		} catch (removeError) {
			setActionError((removeError as Error).message);
		} finally {
			setRemovingUserId(null);
		}
	}

	async function handleMakeOwner(userId: string) {
		setPromotingUserId(userId);
		setActionError("");
		try {
			await api.transferOwnership(conversation.id, userId);
			// Nothing local to update: `conversation:updated` carries the new roles
			// back to everyone including this tab, so the crown moves through the
			// same path for the person who pressed the button as for everyone else.
		} catch (transferError) {
			setActionError((transferError as Error).message);
		} finally {
			setPromotingUserId(null);
		}
	}

	async function handleToggleAdmin(userId: string, role: ConversationRole) {
		setChangingRoleUserId(userId);
		setActionError("");
		try {
			await api.setParticipantRole(conversation.id, userId, role === "admin" ? "member" : "admin");
		} catch (roleError) {
			setActionError((roleError as Error).message);
		} finally {
			setChangingRoleUserId(null);
		}
	}

	async function handleLeave() {
		setIsConfirmingLeave(false);
		setIsLeaving(true);
		setActionError("");
		try {
			await api.removeParticipant(conversation.id, currentUserId);
			// No local cleanup on success: this fires the same `conversation:left`
			// event a kick does, and the page reacts to that one event whether the
			// removal happened here, from another tab, or from someone else — one
			// code path, not this component racing to also deselect itself.
		} catch (leaveError) {
			setActionError((leaveError as Error).message);
			setIsLeaving(false);
		}
	}

	return (
		<div className={cn("shrink-0 bg-paper-raised", isEmbedded ? "px-0 py-1" : "border-b border-rule px-7 py-5")}>
			{!isEmbedded && (
				<div className="flex items-center justify-between">
					<h2 className="eyebrow text-ink-soft">Group members</h2>
					<Button variant="ghost" onClick={onClose} aria-label="Close group settings" className="size-8 p-0">
						<X className="size-4" />
					</Button>
				</div>
			)}

			<div className="mt-3 flex items-end gap-2">
				{/* Wrapped rather than passed a className: TextField forwards
				    className to the <input> it renders, not to its own wrapping
				    <div>, so this is what actually makes the field stretch. */}
				<div className="flex-1">
					<TextField
						label="Group name"
						value={nameDraft}
						onChange={(event) => setNameDraft(event.target.value)}
						disabled={!canModerate}
						error={nameError}
					/>
				</div>
				<Button
					onClick={() => void handleSaveName()}
					disabled={
						!canModerate || isSavingName || !nameDraft.trim() || nameDraft.trim() === conversation.name
					}
				>
					Save
				</Button>
			</div>

			{/* Said out loud rather than left as a field that silently does
			    nothing: a disabled control with no explanation reads as a bug. */}
			{!canModerate && (
				<p className="eyebrow mt-2 text-ink-faint">Only group owners and admins can rename this group.</p>
			)}

			<GroupInvitePolicyControl
				conversationId={conversation.id}
				policy={conversation.invitePolicy}
				isOwner={isOwner}
			/>

			{actionError && (
				<p role="alert" className="eyebrow mt-3 text-signal">
					{actionError}
				</p>
			)}

			{/* Three sections in the order Instagram puts them: who is here, how to
			    add someone, and only then the way out. Leaving used to sit between the
			    member list and the search box, so the most destructive control on the
			    panel was also the one the eye reached first on the way to the least. */}
			<section className="mt-5">
				<h3 className="eyebrow text-ink-faint">Members · {conversation.participants.length}</h3>
				<ul className="mt-2 flex max-h-56 flex-col gap-0.5 overflow-y-auto">
					{conversation.participants.map((participant) => (
						<GroupMemberRow
							key={participant.id}
							participant={participant}
							isSelf={participant.id === currentUserId}
							canTransferOwnership={isOwner && participant.id !== currentUserId}
							canChangeAdmin={isOwner && participant.id !== currentUserId && participant.role !== "owner"}
							canRemove={
								participant.id !== currentUserId &&
								(isOwner || (isAdmin && participant.role === "member"))
							}
							isPromoting={promotingUserId === participant.id}
							isChangingRole={changingRoleUserId === participant.id}
							isRemoving={removingUserId === participant.id}
							onMakeOwner={() => void handleMakeOwner(participant.id)}
							onToggleAdmin={() => void handleToggleAdmin(participant.id, participant.role)}
							onRemove={() => setMemberPendingRemoval(participant)}
						/>
					))}
				</ul>
			</section>

			<GroupMemberSearch
				conversationId={conversation.id}
				participantIds={conversation.participants.map((participant) => participant.id)}
				canInvite={canInvite}
			/>

			{/* Ruled off rather than merely spaced: the two sections above are things
			    you do to the group, and this is the one you do to your own membership. */}
			<div className="mt-6 border-t border-rule-soft pt-5">
				<Button
					variant="danger"
					onClick={() => setIsConfirmingLeave(true)}
					disabled={isLeaving}
					className="w-full"
				>
					<LogOut className="size-4" />
					Leave group
				</Button>
			</div>

			{memberPendingRemoval && (
				<ConfirmDialog
					title="Remove from the group?"
					body={`${memberPendingRemoval.displayName} will lose access to this conversation and everything in it. They can be added back under the current invite policy.`}
					confirmLabel="Remove"
					onConfirm={() => void handleRemoveMember(memberPendingRemoval.id)}
					onCancel={() => setMemberPendingRemoval(null)}
				/>
			)}

			{isConfirmingLeave && (
				<ConfirmDialog
					title="Leave this group?"
					body="You will stop receiving its messages and it will disappear from your list, including from your search. Somebody still in it can add you back."
					confirmLabel="Leave"
					onConfirm={() => void handleLeave()}
					onCancel={() => setIsConfirmingLeave(false)}
				/>
			)}
		</div>
	);
}
