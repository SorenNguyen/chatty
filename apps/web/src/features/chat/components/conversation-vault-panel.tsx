import type { ConversationDTO } from "@chatty/shared-types";
import { ChevronLeft, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { VAULT_TABS, type VaultTab } from "../constants/vault";
import { useConversationVault } from "../hooks/use-conversation-vault";
import { getDirectPeer } from "../utils";
import { ConversationBlockControl } from "./conversation-block-control";
import { ConversationDetailsIdentity } from "./conversation-details-identity";
import { ConversationRestrictControl } from "./conversation-restrict-control";
import { GroupMembersPanel } from "./group-members-panel";
import { VaultCategoryList } from "./vault-category-list";
import { VaultTabContent } from "./vault-tab-content";

interface ConversationVaultPanelProps {
	conversation: ConversationDTO;
	currentUserId: string;
	/** Presence for the identity block at the top — the same set the header reads. */
	onlineUserIds: Set<string>;
	onClose: () => void;
	onOpenMessage: (messageId: string) => void;
}

/**
 * What a conversation holds, in two levels rather than six tabs.
 *
 * The panel opens on **who this is** and **what is in here** — identity, then a
 * list of categories with their counts — and a category opens into its own
 * full-height view with a way back. That is the shape KakaoTalk, WhatsApp and
 * Telegram all converge on, and the reason is width: six tabs in a 448px column
 * had to scroll sideways, which hid half of them behind a gesture nobody
 * performs and still could not say how many files were in there.
 *
 * It stays a sheet beside the thread rather than becoming a modal over it, and
 * that is the load-bearing decision. Tapping a photo jumps to the message it
 * came from, in the conversation *behind* this panel — from a modal with its own
 * navigation, that jump would have to tear down the modal first, and the panel
 * would have replaced the thing it exists to point at.
 */
export function ConversationVaultPanel({
	conversation,
	currentUserId,
	onlineUserIds,
	onClose,
	onOpenMessage,
}: ConversationVaultPanelProps) {
	// A group opens on its members, because the header button that opens this
	// panel is labelled "Group members" for a group and that is what it must then
	// show. Back reveals the categories underneath it. A direct conversation's
	// button says "Conversation storage and details", and lands there.
	const panelRef = useRef<HTMLElement>(null);
	const [activeTab, setActiveTab] = useState<VaultTab | null>(conversation.isGroup ? "members" : null);
	const vault = useConversationVault(conversation.id, activeTab);
	const blockablePeer = conversation.isGroup ? null : getDirectPeer(conversation, currentUserId);
	const activeLabel = VAULT_TABS.find((tab) => tab.id === activeTab)?.label ?? "";

	useEffect(() => {
		// `pointerdown` rather than `click`, which is the event every other
		// dismissible surface in this feature already listens on: a click fires
		// after the press has moved focus, and on touch after a delay long enough
		// that the panel reads as having ignored the tap.
		//
		// Nothing guards "is it open", because this panel is unmounted when it is
		// closed — and the press that opened it landed before this listener
		// existed, which is what stops the panel closing itself on the way in.
		//
		// The confirmation dialogs and the image lightbox are rendered inside this
		// element, so `contains` already treats a press on either as inside. That
		// is load-bearing: they cover the viewport, and a panel that closed
		// underneath its own "Block this person?" dialog would leave the dialog
		// standing over a conversation it no longer belongs to.
		function dismissFromOutside(event: PointerEvent): void {
			if (!panelRef.current?.contains(event.target as Node)) onClose();
		}

		document.addEventListener("pointerdown", dismissFromOutside);

		return () => {
			document.removeEventListener("pointerdown", dismissFromOutside);
		};
		// Escape is deliberately absent: `useKeyboardShortcuts` already closes this
		// panel, and it does so as part of an ordered chain — help, then forwarding,
		// then this. A second listener here would close two surfaces with one key.
	}, [onClose]);

	return (
		<aside
			ref={panelRef}
			// Named on the landmark rather than left to the heading inside it: the
			// heading becomes the open category's label, and a region whose name
			// changes as you navigate inside it cannot be addressed by name at all.
			aria-label="Conversation details"
			className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-rule bg-paper-raised shadow-lift"
		>
			{/* The title takes the centre and the controls keep the corners — the
			    arrangement every sheet in a messenger uses, and the one that stops a
			    two-word title reading as the start of a toolbar. Back is on the left
			    because it is the same gesture as the mobile thread's own back. */}
			<div className="relative flex h-12 shrink-0 items-center justify-center border-b border-rule px-2">
				{activeTab && (
					<Button
						variant="ghost"
						onClick={() => setActiveTab(null)}
						aria-label="Back to conversation details"
						className="absolute left-2 size-8 p-0"
					>
						<ChevronLeft className="size-4" />
					</Button>
				)}
				<h2 className="eyebrow text-ink-soft">{activeTab ? activeLabel : "Conversation details"}</h2>
				<Button
					variant="ghost"
					onClick={onClose}
					aria-label="Close conversation storage"
					className="absolute right-2 size-8 p-0"
				>
					<X className="size-4" />
				</Button>
			</div>

			{!activeTab && (
				<>
					<ConversationDetailsIdentity
						conversation={conversation}
						currentUserId={currentUserId}
						onlineUserIds={onlineUserIds}
					/>
					<div className="min-h-0 flex-1 overflow-y-auto py-2">
						<VaultCategoryList
							summary={vault.summary}
							memberCount={conversation.isGroup ? conversation.participants.length : null}
							onSelect={setActiveTab}
						/>
					</div>
					{/* Last, not first. Direct conversations only: a block is between two
					    people and deliberately does not reach into a group they share. */}
					{blockablePeer && <ConversationRestrictControl peer={blockablePeer} />}
					{blockablePeer && <ConversationBlockControl peer={blockablePeer} />}
				</>
			)}

			{activeTab && (
				<div className="min-h-0 flex-1 overflow-y-auto p-4">
					{activeTab === "members" ? (
						<GroupMembersPanel
							conversation={conversation}
							currentUserId={currentUserId}
							onClose={onClose}
							isEmbedded
						/>
					) : (
						<VaultTabContent
							activeTab={activeTab}
							attachments={vault.attachments}
							links={vault.links}
							saved={vault.saved}
							isLoading={vault.isLoading}
							error={vault.error}
							hasMore={vault.hasMore}
							nextCursor={vault.nextCursor}
							loadMoreRef={vault.loadMoreRef}
							onLoadPage={vault.loadPage}
							onRemoveSaved={vault.removeSaved}
							onOpenMessage={onOpenMessage}
						/>
					)}
				</div>
			)}
		</aside>
	);
}
