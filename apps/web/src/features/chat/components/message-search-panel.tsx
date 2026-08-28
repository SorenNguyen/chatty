import { Search, X } from "lucide-react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { useMessageSearch } from "../hooks";
import { formatMessageTime, getSearchResultTitle } from "../utils";

interface MessageSearchPanelProps {
	currentUserId: string;
	/** Which conversation to open when a result is chosen. */
	onSelectResult: (conversationId: string) => void;
}

/**
 * Find a message across every conversation, from the sidebar.
 *
 * Results replace the conversation list rather than appearing beside it: the
 * sidebar is one column, and two scrolling lists in it would leave neither
 * enough room to read. Clearing the box brings the conversations back.
 *
 * Choosing a result opens its conversation at the bottom, **not** at the
 * matching message. Scrolling to a message that may be a thousand older ones
 * back means paging until it is loaded, which is a different feature — and one
 * that is worth doing properly rather than approximating here.
 */
export function MessageSearchPanel({ currentUserId, onSelectResult }: MessageSearchPanelProps) {
	const { query, setQuery, results, isSearching, error, hasNoResults, clear } = useMessageSearch();

	function handleSelect(conversationId: string) {
		clear();
		onSelectResult(conversationId);
	}

	return (
		<div className="flex min-h-0 flex-col border-b border-slate-200">
			<div className="relative px-4 py-3">
				<Search className="pointer-events-none absolute left-7 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
				<input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search messages"
					aria-label="Search messages"
					className="w-full rounded-full border border-slate-300 py-2 pl-9 pr-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
				/>
				{query && (
					<Button
						variant="ghost"
						onClick={clear}
						aria-label="Clear search"
						className="absolute right-6 top-1/2 size-6 -translate-y-1/2 rounded-full p-0"
					>
						<X className="size-3.5" />
					</Button>
				)}
			</div>

			{error && <p className="px-4 pb-3 text-xs text-red-600">{error}</p>}

			{isSearching && results.length === 0 && <p className="px-4 pb-3 text-xs text-slate-500">Searching…</p>}

			{hasNoResults && !isSearching && (
				<p className="px-4 pb-3 text-xs text-slate-500">No messages match “{query.trim()}”.</p>
			)}

			{results.length > 0 && (
				<ul className="min-h-0 flex-1 overflow-y-auto pb-2">
					{results.map(({ message, conversation }) => (
						<li key={message.id}>
							<Button
								variant="ghost"
								onClick={() => handleSelect(conversation.id)}
								// A result row is a full-width, left-aligned block rather than
								// a centred action — the same shape a conversation row takes,
								// and for the same reason. twMerge lets these beat Button's
								// defaults.
								className={cn(
									"w-full flex-col items-stretch gap-0.5 rounded-none px-4 py-2 text-left",
									"hover:bg-slate-100",
								)}
							>
								<span className="flex items-baseline justify-between gap-2">
									<span className="truncate text-sm font-semibold text-slate-900">
										{getSearchResultTitle(conversation, currentUserId)}
									</span>
									<span className="shrink-0 text-[10px] text-slate-400">
										{formatMessageTime(message.createdAt)}
									</span>
								</span>
								<span className="truncate text-xs text-slate-500">
									{/* Named even in a direct chat: a result list is read out of
									    context, and "who said it" is half of what identifies it. */}
									{message.author?.displayName}: {message.content}
								</span>
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
