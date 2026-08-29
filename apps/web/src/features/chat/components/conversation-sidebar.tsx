import type { ConversationDTO, CurrentUserDTO } from "@chatty/shared-types";
import { Link } from "react-router-dom";
import { LogOut, Settings } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { ConversationList } from "./conversation-list";
import { NewConversationPanel } from "./new-conversation-panel";

interface ConversationSidebarProps {
	currentUser: CurrentUserDTO;
	conversations: ConversationDTO[];
	selectedConversationId: string | null;
	onlineUserIds: Set<string>;
	onSelect: (conversationId: string) => void;
	onConversationStarted: (conversationId: string) => void;
	onSignOut: () => void;
	className?: string;
}

/**
 * The left column: the wordmark, the search, the list, and you.
 *
 * Split out of `ChatPage` because that file was carrying the whole socket state
 * machine as well as two screens' worth of markup and had grown past the point
 * where either could be read without scrolling past the other. Every piece of
 * state still lives in the page; this only renders it.
 */
export function ConversationSidebar({
	currentUser,
	conversations,
	selectedConversationId,
	onlineUserIds,
	onSelect,
	onConversationStarted,
	onSignOut,
	className,
}: ConversationSidebarProps) {
	return (
		<aside
			className={cn("flex w-full shrink-0 flex-col border-r border-rule bg-paper-raised md:w-[332px]", className)}
		>
			<div className="flex items-baseline justify-between px-5 pb-4 pt-5">
				{/* The one serif on the screen, and the one place the signal colour
				    is used decoratively rather than to mark something. */}
				<h1 className="flex items-baseline gap-2 font-display text-[26px] leading-none tracking-tight">
					Chatty
					<span aria-hidden="true" className="size-[5px] bg-signal" />
				</h1>
			</div>

			<NewConversationPanel onConversationStarted={onConversationStarted} />

			<div className="flex items-baseline justify-between px-5 pb-2.5 pt-1">
				<span className="eyebrow text-ink-faint">Conversations</span>
				<span className="meta text-ink-faint">{String(conversations.length).padStart(2, "0")}</span>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				<ConversationList
					conversations={conversations}
					currentUserId={currentUser.id}
					selectedConversationId={selectedConversationId}
					onlineUserIds={onlineUserIds}
					onSelect={onSelect}
				/>
			</div>

			{/* Pinned to the bottom, where an account lives in every application
			    shell people already use. It sat in the header before, which put the
			    thing you touch least at the top of the thing you scan most. */}
			<div className="flex shrink-0 items-center gap-3 border-t border-rule px-5 py-3.5">
				<Avatar user={currentUser} size="sm" />

				<div className="min-w-0 flex-1">
					<p className="truncate text-[13px] font-semibold leading-tight">{currentUser.displayName}</p>
					<p className="meta truncate text-ink-faint">@{currentUser.handle}</p>
				</div>

				<Link
					to="/profile"
					aria-label="Account settings"
					className="flex size-8 shrink-0 items-center justify-center rounded-control text-ink-soft transition hover:bg-ink/5 hover:text-ink"
				>
					<Settings className="size-4" />
				</Link>

				<Button variant="ghost" onClick={onSignOut} aria-label="Sign out" className="size-8 shrink-0 p-0">
					<LogOut className="size-4" />
				</Button>
			</div>
		</aside>
	);
}
