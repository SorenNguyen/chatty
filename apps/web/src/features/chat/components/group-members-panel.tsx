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
		<div className="border-b border-rule bg-paper-raised px-6 py-5">
			<div className="flex items-center justify-between">
				<h2 className="eyebrow text-ink-soft">Group members</h2>
				<Button
					variant="ghost"
					onClick={onClose}
					aria-label="Close group settings"
					className="size-8 rounded-md p-0"
				>
					<X className="size-4" strokeWidth={1.75} />
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
			{!isOwner && <p className="eyebrow mt-2 text-ink-faint">Only the group owner can rename this group.</p>}

			{actionError && <p className="eyebrow mt-3 text-signal">{actionError}</p>}

			<ul className="mt-4 flex max-h-48 flex-col overflow-y-auto">
				{conversation.participants.map((participant) => {
					const isSelf = participant.id === currentUserId;

					return (
						<li key={participant.id} className="flex items-center gap-2.5 py-1.5">
							<Avatar user={participant} size="sm" />
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="w-full truncate text-[0.8125rem] font-medium text-ink">
									{participant.displayName}
									{isSelf && <span className="text-ink-faint"> (you)</span>}
									{/* Who to ask, when the rename field is greyed out and
									    the remove buttons are not there. */}
									{participant.role === "owner" && (
										<span className="eyebrow ml-2 rounded-[3px] border border-rule px-1.5 py-0.5 text-ink-soft">
											Owner
										</span>
									)}
								</span>
								<span className="meta w-full truncate text-ink-faint">@{participant.handle}</span>
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
										className="size-8 rounded-md p-0"
									>
										<Crown className="size-4" strokeWidth={1.75} />
									</Button>
									<Button
										variant="ghost"
										onClick={() => void handleRemoveMember(participant.id)}
										disabled={removingUserId === participant.id}
										aria-label={`Remove ${participant.displayName} from the group`}
										className="size-8 rounded-md p-0"
									>
										<UserMinus className="size-4" strokeWidth={1.75} />
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
				className="mt-3 w-full text-signal hover:bg-signal-soft hover:text-signal"
			>
				<LogOut className="size-4" strokeWidth={1.75} />
				Leave group
			</Button>

			<form onSubmit={search} className="mt-4">
				<div className="flex items-center gap-2.5 border-b border-rule pb-2.5 focus-within:border-ink">
					<Search className="size-4 shrink-0 text-ink-faint" strokeWidth={1.75} />
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Add someone by name or email"
						aria-label="Add a member"
						className="w-full bg-transparent text-[0.8125rem] text-ink outline-none placeholder:text-ink-faint"
					/>
				</div>
			</form>

			{isSearching && <p className="eyebrow mt-3 text-ink-faint">Searching…</p>}
			{searchError && <p className="eyebrow mt-3 text-signal">{searchError}</p>}

			{results.length > 0 && (
				<ul className="mt-3 flex max-h-48 flex-col gap-0.5 overflow-y-auto">
					{results.map((user) => (
						<li key={user.id}>
							<Button
								variant="ghost"
								onClick={() => void handleAddMember(user)}
								disabled={addingUserId === user.id}
								aria-label={`Add ${user.displayName} @${user.handle}`}
								className="w-full items-center justify-start gap-2.5 rounded-md px-2.5 py-2 font-normal"
							>
								<Avatar user={user} size="sm" />
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="w-full truncate text-left text-[0.8125rem] font-medium">
										{user.displayName}
									</span>
									<span className="meta w-full truncate text-left text-ink-faint">
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
