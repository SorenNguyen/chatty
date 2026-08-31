import type { MessageDTO } from "@chatty/shared-types";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/utils/cn";
import {
	ConnectionBanner,
	ConversationHeader,
	ConversationMessageSearch,
	ConversationSidebar,
	GroupMembersPanel,
	MessageInput,
	MessageList,
	ThreadLoadError,
} from "../components";
import {
	useConversationList,
	useConversationMessages,
	useDocumentTitle,
	useMarkRead,
	useMessageNotifications,
	usePresence,
	useSocketConnection,
	useTypingParticipants,
} from "../hooks";
import type { MessageSearchSession } from "../types/message-search";
import { getNewestStoredMessage } from "../utils";

export function ChatPage() {
	const currentUser = useAuth((state) => state.currentUser);
	const logout = useAuth((state) => state.logout);

	const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
	const [isManagingGroup, setIsManagingGroup] = useState(false);
	// The reply target lives here rather than in the composer, because the message
	// is picked in the list and answered in the composer — two siblings, so the
	// state belongs to the parent that owns both.
	const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);
	const [requestedMessageId, setRequestedMessageId] = useState<string | null>(null);
	const [isConversationSearchOpen, setIsConversationSearchOpen] = useState(false);

	const onlineUserIds = usePresence();
	const typingUserIds = useTypingParticipants(selectedConversationId);

	const { conversations, refresh: refreshConversations } = useConversationList(
		currentUser?.id,
		// Deselect only when the conversation that ended is the one on screen —
		// leaving a group you were not looking at must not close the one you were.
		useCallback((conversationId: string) => {
			setSelectedConversationId((current) => (current === conversationId ? null : current));
		}, []),
	);

	// Both are about the tab nobody is looking at: one says something happened in
	// the title, the other says it in a notification.
	useDocumentTitle(conversations);
	useMessageNotifications(currentUser?.id ?? "");

	const {
		messages,
		hasMoreOlder,
		isLoadingOlder,
		loadOlder,
		hasMoreNewer,
		isLoadingNewer,
		loadNewer,
		isLoadingThread,
		loadError,
		retryLoad,
		resync,
		sendMessage,
		sendSticker,
		retrySend,
		discardDraft,
		editMessage,
		deleteMessage,
		toggleReaction,
		hideMessage,
		targetMessageId,
	} = useConversationMessages(selectedConversationId, refreshConversations, requestedMessageId);

	// Everything on this screen is pushed rather than polled, so a socket that
	// was down missed both halves of the state: the sidebar's ordering, previews
	// and unread counts, and the open thread's messages. Neither repairs itself.
	const isConnectionLost = useSocketConnection(
		useCallback(() => {
			refreshConversations();
			resync();
		}, [refreshConversations, resync]),
	);

	useEffect(() => {
		setIsManagingGroup(false);
		setIsConversationSearchOpen(false);
	}, [selectedConversationId]);

	// Reading is defined by what is on screen, so the marker follows the newest
	// loaded message rather than the newest that exists. Loading older pages
	// prepends and leaves this untouched, which is what stops scrolling up from
	// looking like unreading.
	//
	// Drafts are skipped, and that is not cosmetic: a draft's id names nothing on
	// the server, so moving the read marker to one would be a request the server
	// can only refuse.
	const newestStoredMessageId = getNewestStoredMessage(messages)?.id;
	useMarkRead(selectedConversationId, newestStoredMessageId);

	function handleConversationStarted(conversationId: string) {
		refreshConversations();
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
		<div className="flex h-dvh flex-col overflow-hidden bg-paper">
			{isConnectionLost && <ConnectionBanner />}

			<div className="flex min-h-0 flex-1">
				<ConversationSidebar
					currentUser={currentUser}
					conversations={conversations}
					selectedConversationId={selectedConversationId}
					onlineUserIds={onlineUserIds}
					onSelect={handleConversationSelected}
					onConversationStarted={handleConversationStarted}
					onSignOut={logout}
					className={cn(selectedConversation && "max-md:hidden")}
				/>

				<main className={cn("min-w-0 flex-1 flex-col", selectedConversation ? "flex" : "hidden md:flex")}>
					{selectedConversation ? (
						<>
							<ConversationHeader
								conversation={selectedConversation}
								currentUserId={currentUser.id}
								onlineUserIds={onlineUserIds}
								typingUserIds={typingUserIds}
								onToggleGroupMembers={() => setIsManagingGroup((current) => !current)}
								isManagingGroup={isManagingGroup}
								onBack={() => {
									setReplyTo(null);
									setSelectedConversationId(null);
								}}
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
								{loadError ? (
									<ThreadLoadError message={loadError} onRetry={retryLoad} />
								) : (
									<MessageList
										messages={messages}
										currentUserId={currentUser.id}
										participants={selectedConversation.participants}
										isGroup={selectedConversation.isGroup}
										areReceiptsShared={currentUser.readReceiptsEnabled}
										isLoadingThread={isLoadingThread}
										hasMoreOlder={hasMoreOlder}
										isLoadingOlder={isLoadingOlder}
										onLoadOlder={loadOlder}
										hasMoreNewer={hasMoreNewer}
										isLoadingNewer={isLoadingNewer}
										onLoadNewer={loadNewer}
										onEditMessage={editMessage}
										onDeleteMessage={deleteMessage}
										onHideMessage={hideMessage}
										onRetrySend={retrySend}
										onDiscardDraft={discardDraft}
										onToggleReaction={toggleReaction}
										onReplyToMessage={setReplyTo}
										targetMessageId={targetMessageId}
										onReturnToLatest={closeMessageSearch}
									/>
								)}
							</div>

							<MessageInput
								conversationId={selectedConversation.id}
								replyTo={replyTo}
								onCancelReply={() => setReplyTo(null)}
								onSend={sendMessage}
								onSendSticker={sendSticker}
							/>
						</>
					) : (
						<div className="flex flex-1 items-center justify-center">
							<p className="text-sm text-ink-faint">
								Pick a conversation, or search for someone to start one.
							</p>
						</div>
					)}
				</main>
			</div>
		</div>
	);
}
