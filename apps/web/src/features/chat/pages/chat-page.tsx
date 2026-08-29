import type { ConversationDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LogOut, Settings } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { CurrentUserAvatar } from "@/components/current-user-avatar";
import { useAuth } from "@/hooks/use-auth";
import {
	ConversationHeader,
	ConversationMessageSearch,
	ConversationList,
	GroupMembersPanel,
	MessageInput,
	MessageList,
	NewConversationPanel,
} from "../components";
import {
	useConversationListEvents,
	useConversationMessages,
	useMarkRead,
	usePresence,
	usePresenceLastSeenSync,
	useTypingParticipants,
} from "../hooks";
import type { MessageSearchSession } from "../types/message-search";

export function ChatPage() {
	const currentUser = useAuth((state) => state.currentUser);
	const logout = useAuth((state) => state.logout);

	const [conversations, setConversations] = useState<ConversationDTO[]>([]);
	const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
	const [isManagingGroup, setIsManagingGroup] = useState(false);
	const [requestedMessageId, setRequestedMessageId] = useState<string | null>(null);
	const [isConversationSearchOpen, setIsConversationSearchOpen] = useState(false);

	const onlineUserIds = usePresence();
	usePresenceLastSeenSync(setConversations);
	const typingUserIds = useTypingParticipants(selectedConversationId);

	const refreshConversations = useCallback(async () => {
		setConversations(await api.listConversations());
	}, []);

	const handleConversationsChanged = useCallback(() => {
		void refreshConversations();
	}, [refreshConversations]);

	const {
		messages,
		hasMoreOlder,
		isLoadingOlder,
		loadOlder,
		hasMoreNewer,
		isLoadingNewer,
		loadNewer,
		editMessage,
		deleteMessage,
		hideMessage,
		targetMessageId,
	} = useConversationMessages(selectedConversationId, handleConversationsChanged, requestedMessageId);

	useEffect(() => {
		void refreshConversations();
	}, [refreshConversations]);

	useEffect(() => {
		setIsManagingGroup(false);
		setIsConversationSearchOpen(false);
	}, [selectedConversationId]);

	// Reading is defined by what is on screen, so the marker follows the newest
	// loaded message rather than the newest that exists. Loading older pages
	// prepends and leaves this untouched, which is what stops scrolling up from
	// looking like unreading.
	useMarkRead(selectedConversationId, messages[messages.length - 1]?.id);

	useConversationListEvents({
		setConversations,
		currentUserId: currentUser?.id,
		selectedConversationId,
		onSelectedConversationLeft: useCallback(() => setSelectedConversationId(null), []),
	});

	function handleConversationStarted(conversationId: string) {
		void refreshConversations();
		setIsConversationSearchOpen(false);
		setRequestedMessageId(null);
		setSelectedConversationId(conversationId);
	}

	function handleConversationSelected(conversationId: string) {
		setIsConversationSearchOpen(false);
		setRequestedMessageId(null);
		setSelectedConversationId(conversationId);
	}

	function selectSearchResult(session: MessageSearchSession) {
		const result = session.results[session.activeIndex];
		if (!result) return;

		setSelectedConversationId(result.conversation.id);
		setRequestedMessageId(result.message.id);
	}

	function closeMessageSearch() {
		setIsConversationSearchOpen(false);
		setRequestedMessageId(null);
	}

	const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId);

	if (!currentUser) return null;

	return (
		<div className="flex h-screen bg-paper">
			<aside className="flex w-83 shrink-0 flex-col border-r border-rule bg-paper-raised">
				{/* The product signs its own name once, at the top left, and the small
				    vermilion square beside it is the only decorative use of the signal
				    colour anywhere — it is what makes the mark a mark. */}
				<div className="flex items-baseline gap-2 px-5 pb-4 pt-5">
					<span className="font-display text-[1.625rem] leading-none tracking-tight">Chatty</span>
					<span aria-hidden="true" className="size-1.25 shrink-0 bg-signal" />
				</div>

				<NewConversationPanel onConversationStarted={handleConversationStarted} />

				<p className="eyebrow px-6 pb-2.5 pt-2 text-ink-faint">Conversations</p>

				<div className="min-h-0 flex-1 overflow-y-auto">
					<ConversationList
						conversations={conversations}
						currentUserId={currentUser.id}
						selectedConversationId={selectedConversationId}
						onlineUserIds={onlineUserIds}
						onSelect={handleConversationSelected}
					/>
				</div>

				{/* Your own account sits at the bottom, not the top. The top of a
				    sidebar is where you look to find *other people*; putting yourself
				    there costs the list a row and puts the two controls nobody uses
				    per session above the one thing they came for. */}
				<div className="flex shrink-0 items-center gap-3 border-t border-rule px-5 py-3.5">
					<CurrentUserAvatar user={currentUser} size="sm" />

					<div className="min-w-0 flex-1">
						<p className="truncate text-[0.8125rem] font-semibold leading-tight text-ink">
							{currentUser.displayName}
						</p>
						<p className="meta truncate text-ink-faint">@{currentUser.handle}</p>
					</div>

					<Link
						to="/profile"
						aria-label="Account settings"
						className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink-soft transition hover:bg-ink/5 hover:text-ink"
					>
						<Settings className="size-4" strokeWidth={1.75} />
					</Link>

					<Button variant="ghost" onClick={logout} aria-label="Sign out" className="size-8 rounded-md p-0">
						<LogOut className="size-4" strokeWidth={1.75} />
					</Button>
				</div>
			</aside>

			<main className="flex min-w-0 flex-1 flex-col">
				{selectedConversation ? (
					<>
						<ConversationHeader
							conversation={selectedConversation}
							currentUserId={currentUser.id}
							onlineUserIds={onlineUserIds}
							typingUserIds={typingUserIds}
							onToggleGroupMembers={() => setIsManagingGroup((current) => !current)}
							isManagingGroup={isManagingGroup}
							onOpenMessageSearch={() => {
								setIsManagingGroup(false);
								setRequestedMessageId(null);
								setIsConversationSearchOpen(true);
							}}
						/>

						{isConversationSearchOpen ? (
							<ConversationMessageSearch
								conversationId={selectedConversation.id}
								onSelectResult={selectSearchResult}
								onClearResult={() => {
									setRequestedMessageId(null);
								}}
								onClose={closeMessageSearch}
							/>
						) : null}

						{isManagingGroup && (
							<GroupMembersPanel
								conversation={selectedConversation}
								currentUserId={currentUser.id}
								onClose={() => setIsManagingGroup(false)}
							/>
						)}

						<div className="min-h-0 flex-1">
							<MessageList
								messages={messages}
								currentUserId={currentUser.id}
								participants={selectedConversation.participants}
								isGroup={selectedConversation.isGroup}
								areReceiptsShared={currentUser.readReceiptsEnabled}
								hasMoreOlder={hasMoreOlder}
								isLoadingOlder={isLoadingOlder}
								onLoadOlder={loadOlder}
								hasMoreNewer={hasMoreNewer}
								isLoadingNewer={isLoadingNewer}
								onLoadNewer={loadNewer}
								onEditMessage={editMessage}
								onDeleteMessage={deleteMessage}
								onHideMessage={hideMessage}
								targetMessageId={targetMessageId}
								onReturnToLatest={closeMessageSearch}
							/>
						</div>

						<MessageInput conversationId={selectedConversation.id} />
					</>
				) : (
					<div className="flex flex-1 items-center justify-center">
						<p className="eyebrow text-ink-faint">
							Pick a conversation, or search for someone to start one
						</p>
					</div>
				)}
			</main>
		</div>
	);
}
