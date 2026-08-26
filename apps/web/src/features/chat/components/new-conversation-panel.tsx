import type { UserDTO } from "@chatty/shared-types";
import { useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/api/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { cn } from "@/utils/cn";
import { useUserSearch } from "../hooks";
import { SelectedParticipants } from "./selected-participants";

interface NewConversationPanelProps {
	onConversationStarted: (conversationId: string) => void;
}

export function NewConversationPanel({ onConversationStarted }: NewConversationPanelProps) {
	const { query, setQuery, results, isSearching, error: searchError, search, reset: resetSearch } = useUserSearch();
	const [selectedUsers, setSelectedUsers] = useState<UserDTO[]>([]);
	const [groupName, setGroupName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [createError, setCreateError] = useState("");

	// One selected person is a direct chat; more than one makes it a group, which
	// is the same rule the server applies when deciding `isGroup`.
	const isGroup = selectedUsers.length > 1;

	function handleToggleUser(user: UserDTO) {
		setSelectedUsers((current) =>
			current.some((selected) => selected.id === user.id)
				? current.filter((selected) => selected.id !== user.id)
				: [...current, user],
		);
	}

	function handleRemoveUser(userId: string) {
		setSelectedUsers((current) => current.filter((selected) => selected.id !== userId));
	}

	async function handleCreate() {
		if (selectedUsers.length === 0) return;

		setIsCreating(true);
		setCreateError("");
		try {
			const participantIds = selectedUsers.map((user) => user.id);
			// The name is only meaningful for a group; the server ignores it for a
			// direct chat, which is titled after the other person per viewer.
			const trimmedName = groupName.trim();
			const conversation = await api.createConversation(
				participantIds,
				isGroup && trimmedName ? trimmedName : undefined,
			);

			resetSearch();
			setSelectedUsers([]);
			setGroupName("");
			onConversationStarted(conversation.id);
		} catch (creationError) {
			setCreateError((creationError as Error).message);
		} finally {
			setIsCreating(false);
		}
	}

	return (
		<div className="border-b border-slate-200 p-3">
			<form onSubmit={search}>
				<div className="relative">
					<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Find someone by name or email"
						aria-label="Find someone"
						className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
					/>
				</div>
			</form>

			<SelectedParticipants participants={selectedUsers} onRemove={handleRemoveUser} />

			{isSearching && <p className="mt-2 text-xs text-slate-500">Searching…</p>}
			{(searchError || createError) && <p className="mt-2 text-xs text-red-600">{searchError || createError}</p>}

			{results.length > 0 && (
				<ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
					{results.map((user) => {
						const isSelected = selectedUsers.some((selected) => selected.id === user.id);

						return (
							<li key={user.id}>
								<Button
									variant="ghost"
									onClick={() => handleToggleUser(user)}
									aria-pressed={isSelected}
									// The handle is what makes two people with the same
									// display name tellable apart, so it is part of the
									// accessible name, not decoration.
									aria-label={`${user.displayName} @${user.handle}`}
									className={cn(
										"w-full items-center justify-start gap-2 px-3 py-2 font-normal",
										isSelected && "bg-blue-50 text-blue-700 hover:bg-blue-100",
									)}
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
						);
					})}
				</ul>
			)}

			{isGroup && (
				<div className="mt-3">
					<TextField
						label="Group name (optional)"
						value={groupName}
						onChange={(event) => setGroupName(event.target.value)}
						placeholder="e.g. Weekend football"
					/>
				</div>
			)}

			{selectedUsers.length > 0 && (
				<Button onClick={() => void handleCreate()} disabled={isCreating} className="mt-3 w-full">
					{isGroup
						? `Create group with ${selectedUsers.length} people`
						: `Chat with ${selectedUsers[0]!.displayName}`}
				</Button>
			)}
		</div>
	);
}
