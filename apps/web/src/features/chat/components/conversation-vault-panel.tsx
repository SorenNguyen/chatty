import type {
	AttachmentWithMessageDTO,
	ConversationDTO,
	MessageLinkDTO,
	MessageSearchResultDTO,
} from "@chatty/shared-types";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { VAULT_TABS, type VaultTab } from "../constants/vault";
import { ConversationDetailsIdentity } from "./conversation-details-identity";
import { GroupMembersPanel } from "./group-members-panel";
import { VaultTabContent } from "./vault-tab-content";

interface ConversationVaultPanelProps {
	conversation: ConversationDTO;
	currentUserId: string;
	/** Presence for the identity block at the top — the same set the header reads. */
	onlineUserIds: Set<string>;
	onClose: () => void;
	onOpenMessage: (messageId: string) => void;
}

export function ConversationVaultPanel({
	conversation,
	currentUserId,
	onlineUserIds,
	onClose,
	onOpenMessage,
}: ConversationVaultPanelProps) {
	const [activeTab, setActiveTab] = useState<VaultTab>(conversation.isGroup ? "members" : "media");
	const [attachments, setAttachments] = useState<AttachmentWithMessageDTO[]>([]);
	const [links, setLinks] = useState<MessageLinkDTO[]>([]);
	const [saved, setSaved] = useState<MessageSearchResultDTO[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const [hasMore, setHasMore] = useState(false);
	const [nextCursor, setNextCursor] = useState<string | undefined>();
	const requestSequence = useRef(0);
	const loadMoreRef = useRef<HTMLDivElement>(null);

	const loadPage = useCallback(
		async (before?: string, replace = false) => {
			if (activeTab === "members") return;
			const sequence = ++requestSequence.current;
			setIsLoading(true);
			setError("");
			try {
				if (activeTab === "links") {
					const page = await api.listConversationLinks(conversation.id, 40, before);
					if (sequence !== requestSequence.current) return;
					setLinks((current) => (replace ? page.items : [...current, ...page.items]));
					setNextCursor(page.items.at(-1)?.id);
					setHasMore(page.hasMore);
				} else if (activeTab === "saved") {
					const page = await api.listSavedMessages(40, before);
					if (sequence !== requestSequence.current) return;
					const matching = page.results.filter((item) => item.conversation.id === conversation.id);
					setSaved((current) => (replace ? matching : [...current, ...matching]));
					setNextCursor(page.results.at(-1)?.message.id);
					setHasMore(page.hasMore);
				} else {
					const kind = activeTab === "media" ? "image" : activeTab === "files" ? "file" : "audio";
					const page = await api.listConversationMedia(conversation.id, kind, 40, before);
					if (sequence !== requestSequence.current) return;
					setAttachments((current) => (replace ? page.items : [...current, ...page.items]));
					setNextCursor(page.items.at(-1)?.id);
					setHasMore(page.hasMore);
				}
			} catch (caught) {
				if (sequence === requestSequence.current) {
					setError(caught instanceof Error ? caught.message : "Conversation storage could not be loaded");
				}
			} finally {
				if (sequence === requestSequence.current) setIsLoading(false);
			}
		},
		[activeTab, conversation.id],
	);

	useEffect(() => {
		setAttachments([]);
		setLinks([]);
		setSaved([]);
		setNextCursor(undefined);
		setHasMore(false);
		void loadPage(undefined, true);
	}, [loadPage]);

	useEffect(() => {
		const target = loadMoreRef.current;
		if (!target || !hasMore || isLoading || !nextCursor || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void loadPage(nextCursor);
			},
			{ rootMargin: "240px" },
		);
		observer.observe(target);

		return () => observer.disconnect();
	}, [hasMore, isLoading, loadPage, nextCursor]);

	return (
		<>
			<aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-rule bg-paper-raised shadow-lift">
				{/* The close button is the only control up here, so the title takes the
				    centre and the button keeps the corner — the arrangement every
				    sheet in a messenger uses, and the one that stops a two-word title
				    reading as the start of a toolbar. */}
				<div className="relative flex h-12 shrink-0 items-center justify-center border-b border-rule px-2">
					<h2 className="eyebrow text-ink-soft">Conversation details</h2>
					<Button
						variant="ghost"
						onClick={onClose}
						aria-label="Close conversation storage"
						className="absolute right-2 size-8 p-0"
					>
						<X className="size-4" />
					</Button>
				</div>

				<ConversationDetailsIdentity
					conversation={conversation}
					currentUserId={currentUserId}
					onlineUserIds={onlineUserIds}
				/>

				{/* `flex-1` with `min-w-fit` rather than a fixed width apiece: the tabs
				    share the panel evenly when it is 448px wide, and the strip scrolls
				    instead of clipping a label once the panel is a phone. */}
				<div className="flex shrink-0 overflow-x-auto border-b border-rule px-2">
					{VAULT_TABS.filter((tab) => tab.id !== "members" || conversation.isGroup).map((tab) => (
						<Button
							key={tab.id}
							variant="ghost"
							onClick={() => setActiveTab(tab.id)}
							aria-pressed={activeTab === tab.id}
							className={
								activeTab === tab.id
									? "eyebrow min-w-fit flex-1 rounded-none border-b-2 border-ink px-2 py-3 text-ink hover:bg-transparent"
									: "eyebrow min-w-fit flex-1 rounded-none border-b-2 border-transparent px-2 py-3 text-ink-faint hover:bg-transparent hover:text-ink"
							}
						>
							{tab.label}
						</Button>
					))}
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto p-4">
					{activeTab === "members" && (
						<GroupMembersPanel
							conversation={conversation}
							currentUserId={currentUserId}
							onClose={onClose}
							isEmbedded
						/>
					)}
					{activeTab !== "members" && (
						<VaultTabContent
							activeTab={activeTab}
							conversationId={conversation.id}
							attachments={attachments}
							links={links}
							saved={saved}
							setSaved={setSaved}
							isLoading={isLoading}
							error={error}
							hasMore={hasMore}
							nextCursor={nextCursor}
							loadMoreRef={loadMoreRef}
							onLoadPage={loadPage}
							onOpenMessage={onOpenMessage}
						/>
					)}
				</div>
			</aside>
		</>
	);
}
