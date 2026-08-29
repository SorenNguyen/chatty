import type {
	ConversationDTO,
	ConversationLeftEvent,
	ConversationReadEvent,
	ConversationUpdatedEvent,
} from "@chatty/shared-types";
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
	useConversationMessages,
	useMarkRead,
	usePresence,
	usePresenceLastSeenSync,
	useSocketEvent,
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

	useSocketEvent(
		"conversation:new",
		useCallback((conversation: ConversationDTO) => {
			// Appears immediately even though it has no messages yet — that is the
			// whole point of the event. De-duplicated by id because the creator
			// also receives it, and they already added it from the HTTP response.
			setConversations((current) =>
				current.some((existing) => existing.id === conversation.id) ? current : [conversation, ...current],
			);
		}, []),
	);

	useSocketEvent(
		"conversation:read",
		useCallback(
			(event: ConversationReadEvent) => {
				// Patched in place rather than triggering a refetch: this fires
				// whenever anyone glances at any conversation, and re-listing the
				// sidebar each time would be a request per glance per participant.
				setConversations((current) =>
					current.map((conversation) => {
						if (conversation.id !== event.conversationId) return conversation;

						return {
							...conversation,
							participants: conversation.participants.map((participant) =>
								participant.id === event.userId
									? { ...participant, lastReadMessageId: event.lastReadMessageId }
									: participant,
							),
							// Your own marker moving is the badge clearing — including when
							// it moved on another device, which is the case a refetch-only
							// approach leaves lit until something else happens.
							unreadCount: event.userId === currentUser?.id ? 0 : conversation.unreadCount,
						};
					}),
				);
			},
			[currentUser?.id],
		),
	);

	useSocketEvent(
		"conversation:updated",
		useCallback((event: ConversationUpdatedEvent) => {
			// Patched in place, and only the two fields the event actually carries
			// — `unreadCount` and `lastMessage` are deliberately absent from it
			// (see the type's doc comment), so leaving them untouched here is what
			// keeps them correct rather than overwriting them with nothing.
			setConversations((current) =>
				current.map((conversation) =>
					conversation.id === event.conversationId
						? { ...conversation, name: event.name, participants: event.participants }
						: conversation,
				),
			);
		}, []),
	);

	useSocketEvent(
		"conversation:left",
		useCallback(
			(event: ConversationLeftEvent) => {
				// Fires whether this tab removed itself, another tab of the same
				// session did, or someone else kicked this user — one event for all
				// three, so this is the only place any of them get handled.
				setConversations((current) =>
					current.filter((conversation) => conversation.id !== event.conversationId),
				);

				if (event.conversationId === selectedConversationId) {
					setSelectedConversationId(null);
				}
			},
			[selectedConversationId],
		),
	);

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
		<div className="flex h-screen bg-white">
			<aside className="flex w-80 flex-col border-r border-slate-200">
				<header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
					<CurrentUserAvatar user={currentUser} />

					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-semibold text-slate-900">{currentUser.displayName}</p>
						<p className="truncate text-xs text-slate-500">@{currentUser.handle}</p>
					</div>

					<Link
						to="/profile"
						aria-label="Account settings"
						className="rounded-lg px-2 py-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
					>
						<Settings className="size-4" />
					</Link>

					<Button variant="ghost" onClick={logout} aria-label="Sign out" className="px-2">
						<LogOut className="size-4" />
					</Button>
				</header>

				<NewConversationPanel onConversationStarted={handleConversationStarted} />

				<div className="flex-1 overflow-y-auto">
					<ConversationList
						conversations={conversations}
						currentUserId={currentUser.id}
						selectedConversationId={selectedConversationId}
						onlineUserIds={onlineUserIds}
						onSelect={handleConversationSelected}
					/>
				</div>
			</aside>

			<main className="flex flex-1 flex-col">
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
						<p className="text-sm text-slate-500">
							Pick a conversation, or search for someone to start one.
						</p>
					</div>
				)}
			</main>
		</div>
	);
}
