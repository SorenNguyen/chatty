import type { ConversationDTO, UserDTO } from "@chatty/shared-types";
import { useEffect, useState } from "react";
import { Crown, LogOut, Search, UserMinus, X } from "lucide-react";
import { api } from "@/api/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { useUserSearch } from "../hooks";

interface GroupMembersPanelProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onClose: () => void;
}

/**
 * Rename, member list, and add/remove — everything item 8 needs, in one
 * inline panel rather than a modal. The app has no modal/dialog primitive
 * declared anywhere in its conventions, and `NewConversationPanel` already
 * establishes the pattern this follows: render inline, don't invent one.
 *
 * What the owner sees and a member does not: the rename field enabled, and a
 * remove button on everyone else's row. Members can still invite, and can
 * always leave. See ADR 0008.
 */
export function GroupMembersPanel({ conversation, currentUserId, onClose }: GroupMembersPanelProps) {
	const [nameDraft, setNameDraft] = useState(conversation.name ?? "");
	const [isSavingName, setIsSavingName] = useState(false);
	const [nameError, setNameError] = useState("");
	const [removingUserId, setRemovingUserId] = useState<string | null>(null);
	const [promotingUserId, setPromotingUserId] = useState<string | null>(null);
	const [isLeaving, setIsLeaving] = useState(false);
	const [actionError, setActionError] = useState("");
	const [addingUserId, setAddingUserId] = useState<string | null>(null);

	const participantIds = conversation.participants.map((participant) => participant.id);
	const isOwner = conversation.participants.some(
		(participant) => participant.id === currentUserId && participant.role === "owner",
	);
	const {
		query,
		setQuery,
		results,
		isSearching,
		error: searchError,
		search,
		reset: resetSearch,
	} = useUserSearch(participantIds);

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

	async function handleAddMember(user: UserDTO) {
		setAddingUserId(user.id);
		setActionError("");
		try {
			await api.addParticipant(conversation.id, user.id);
			resetSearch();
		} catch (addError) {
			setActionError((addError as Error).message);
		} finally {
			setAddingUserId(null);
		}
	}

	async function handleRemoveMember(userId: string) {
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

	async function handleLeave() {
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
		<div className="border-b border-slate-200 p-3">
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-semibold text-slate-900">Group members</h2>
				<Button variant="ghost" onClick={onClose} aria-label="Close group settings" className="px-2">
					<X className="size-4" />
				</Button>
			</div>

			<div className="mt-3 flex items-end gap-2">
				{/* Wrapped rather than passed a className: TextField forwards
				    className to the <input> it renders, not to its own wrapping
				    <div>, so this is what actually makes the field stretch. */}
				<div className="flex-1">
					<TextField
						label="Group name"
						value={nameDraft}
						onChange={(event) => setNameDraft(event.target.value)}
						disabled={!isOwner}
						error={nameError}
					/>
				</div>
				<Button
					onClick={() => void handleSaveName()}
					disabled={!isOwner || isSavingName || !nameDraft.trim() || nameDraft.trim() === conversation.name}
				>
					Save
				</Button>
			</div>

			{/* Said out loud rather than left as a field that silently does
			    nothing: a disabled control with no explanation reads as a bug. */}
			{!isOwner && <p className="mt-1 text-xs text-slate-500">Only the group owner can rename this group.</p>}

			{actionError && <p className="mt-2 text-xs text-red-600">{actionError}</p>}

			<ul className="mt-3 flex max-h-48 flex-col gap-1 overflow-y-auto">
				{conversation.participants.map((participant) => {
					const isSelf = participant.id === currentUserId;

					return (
						<li key={participant.id} className="flex items-center gap-2 px-1 py-1">
							<Avatar user={participant} size="sm" />
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="w-full truncate text-sm text-slate-900">
									{participant.displayName}
									{isSelf && <span className="text-slate-500"> (you)</span>}
									{/* Who to ask, when the rename field is greyed out and
									    the remove buttons are not there. */}
									{participant.role === "owner" && (
										<span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
											Owner
										</span>
									)}
								</span>
								<span className="w-full truncate text-xs text-slate-500">@{participant.handle}</span>
							</span>
							{/* No remove button on your own row — leaving has its own
							    clearly-labelled action below, so a small × next to your
							    own name cannot be clicked by accident. */}
							{!isSelf && isOwner && (
								<>
									{/* Handing the group over costs the person pressing it
									    their own role, so it is spelled out in the label
									    rather than left to the crown to imply. */}
									<Button
										variant="ghost"
										onClick={() => void handleMakeOwner(participant.id)}
										disabled={promotingUserId === participant.id}
										aria-label={`Make ${participant.displayName} the group owner`}
										className="px-2"
									>
										<Crown className="size-4" />
									</Button>
									<Button
										variant="ghost"
										onClick={() => void handleRemoveMember(participant.id)}
										disabled={removingUserId === participant.id}
										aria-label={`Remove ${participant.displayName} from the group`}
										className="px-2"
									>
										<UserMinus className="size-4" />
									</Button>
								</>
							)}
						</li>
					);
				})}
			</ul>

			<Button
				variant="ghost"
				onClick={() => void handleLeave()}
				disabled={isLeaving}
				className="mt-2 w-full text-red-600 hover:bg-red-50"
			>
				<LogOut className="size-4" />
				Leave group
			</Button>

			<form onSubmit={search} className="mt-4">
				<div className="relative">
					<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Add someone by name or email"
						aria-label="Add a member"
						className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
					/>
				</div>
			</form>

			{isSearching && <p className="mt-2 text-xs text-slate-500">Searching…</p>}
			{searchError && <p className="mt-2 text-xs text-red-600">{searchError}</p>}

			{results.length > 0 && (
				<ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
					{results.map((user) => (
						<li key={user.id}>
							<Button
								variant="ghost"
								onClick={() => void handleAddMember(user)}
								disabled={addingUserId === user.id}
								aria-label={`Add ${user.displayName} @${user.handle}`}
								className="w-full items-center justify-start gap-2 px-3 py-2 font-normal"
							>
								<Avatar user={user} size="sm" />
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="w-full truncate text-left">{user.displayName}</span>
									<span className="w-full truncate text-left text-xs text-slate-500">
										@{user.handle}
									</span>
								</span>
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
