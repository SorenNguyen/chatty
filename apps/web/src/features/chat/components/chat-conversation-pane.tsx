import type { ConversationDTO, MessageDTO } from "@chatty/shared-types";
import type { ComponentProps } from "react";
import type { MessageSearchSession } from "../types/message-search";
import { ConversationHeader } from "./conversation-header";
import { ConversationMessageSearch } from "./conversation-message-search";
import { ConversationVaultPanel } from "./conversation-vault-panel";
import { ForwardMessagePanel } from "./forward-message-panel";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";
import { PinnedMessagesBanner } from "./pinned-messages-banner";
import { ThreadLoadError } from "./thread-load-error";

interface ChatConversationPaneProps {
	conversation: ConversationDTO;
	currentUserId: string;
	onlineUserIds: Set<string>;
	typingUserIds: string[];
	isManagingDetails: boolean;
	onToggleDetails: () => void;
	onBack: () => void;
	isSearchOpen: boolean;
	onOpenSearch: () => void;
	onCloseSearch: () => void;
	onSelectSearchResult: (session: MessageSearchSession) => void;
	onClearSearchResult: () => void;
	forwardingMessage: MessageDTO | null;
	conversations: ConversationDTO[];
	onCloseForward: () => void;
	onOpenMessage: (messageId: string) => void;
	loadError: string;
	onRetryLoad: () => void;
	messageListProps: ComponentProps<typeof MessageList>;
	messageInputProps: ComponentProps<typeof MessageInput>;
}

export function ChatConversationPane({
	conversation,
	currentUserId,
	onlineUserIds,
	typingUserIds,
	isManagingDetails,
	onToggleDetails,
	onBack,
	isSearchOpen,
	onOpenSearch,
	onCloseSearch,
	onSelectSearchResult,
	onClearSearchResult,
	forwardingMessage,
	conversations,
	onCloseForward,
	onOpenMessage,
	loadError,
	onRetryLoad,
	messageListProps,
	messageInputProps,
}: ChatConversationPaneProps) {
	return (
		<>
			{forwardingMessage && (
				<ForwardMessagePanel
					message={forwardingMessage}
					conversations={conversations}
					currentUserId={currentUserId}
					onClose={onCloseForward}
				/>
			)}
			<ConversationHeader
				conversation={conversation}
				currentUserId={currentUserId}
				onlineUserIds={onlineUserIds}
				typingUserIds={typingUserIds}
				onToggleGroupMembers={onToggleDetails}
				isManagingGroup={isManagingDetails}
				onBack={onBack}
				onOpenMessageSearch={onOpenSearch}
			/>
			<PinnedMessagesBanner pinnedMessages={conversation.pinnedMessages} onOpenMessage={onOpenMessage} />

			{isSearchOpen && (
				<ConversationMessageSearch
					conversationId={conversation.id}
					onSelectResult={onSelectSearchResult}
					onClearResult={onClearSearchResult}
					onClose={onCloseSearch}
				/>
			)}

			{isManagingDetails && (
				<ConversationVaultPanel
					conversation={conversation}
					currentUserId={currentUserId}
					onlineUserIds={onlineUserIds}
					onClose={onToggleDetails}
					onOpenMessage={onOpenMessage}
				/>
			)}

			<div className="min-h-0 flex-1">
				{loadError ? (
					<ThreadLoadError message={loadError} onRetry={onRetryLoad} />
				) : (
					<MessageList {...messageListProps} />
				)}
			</div>
			<MessageInput {...messageInputProps} />
		</>
	);
}
