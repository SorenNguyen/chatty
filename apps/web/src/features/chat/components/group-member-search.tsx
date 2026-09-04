import { useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/api/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { useUserSearch } from "../hooks";

interface GroupMemberSearchProps {
	conversationId: string;
	participantIds: string[];
	canInvite: boolean;
}

/**
 * Keeps search and invite failures local to the add-people control. This also
 * prevents a failed invitation from obscuring unrelated moderation feedback.
 */
export function GroupMemberSearch({ conversationId, participantIds, canInvite }: GroupMemberSearchProps) {
	const [addingUserId, setAddingUserId] = useState<string | null>(null);
	const [actionError, setActionError] = useState("");
	const { query, setQuery, results, isSearching, error: searchError, search, reset } = useUserSearch(participantIds);

	async function handleAddMember(userId: string) {
		setAddingUserId(userId);
		setActionError("");
		try {
			await api.addParticipant(conversationId, userId);
			reset();
		} catch (addError) {
			setActionError((addError as Error).message);
		} finally {
			setAddingUserId(null);
		}
	}

	return (
		<section className="mt-5">
			<h3 className="eyebrow text-ink-faint">Add people</h3>
			{canInvite ? (
				<form onSubmit={search} className="mt-2">
					<div className="flex items-center gap-2.5 border-b border-rule pb-2.5 transition-colors focus-within:border-ink">
						<Search className="size-[15px] shrink-0 text-ink-faint" />
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Name, @handle or email"
							aria-label="Add a member"
							className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-faint"
						/>
					</div>
				</form>
			) : (
				<p className="mt-2 text-sm text-ink-soft">This group lets only owners and admins add people.</p>
			)}

			{canInvite && isSearching && <p className="eyebrow mt-3 text-ink-faint">Searching…</p>}
			{(searchError || actionError) && (
				<p role="alert" className="eyebrow mt-3 text-signal">
					{searchError || actionError}
				</p>
			)}

			{canInvite && results.length > 0 && (
				<ul className="mt-2 flex max-h-48 flex-col gap-0.5 overflow-y-auto">
					{results.map((user) => (
						<li key={user.id}>
							<Button
								variant="ghost"
								onClick={() => void handleAddMember(user.id)}
								disabled={addingUserId === user.id}
								aria-label={`Add ${user.displayName} @${user.handle}`}
								className="w-full items-center justify-start gap-2.5 px-2 py-2 font-normal"
							>
								<Avatar user={user} size="sm" />
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="w-full truncate text-left text-[13px] font-medium text-ink">
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
		</section>
	);
}
