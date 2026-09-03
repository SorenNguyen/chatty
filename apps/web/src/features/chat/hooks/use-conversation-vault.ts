import type {
	AttachmentWithMessageDTO,
	ConversationVaultSummaryDTO,
	MessageLinkDTO,
	MessageSearchResultDTO,
} from "@chatty/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { api } from "@/api/client";
import type { VaultTab } from "../constants/vault";
import { useInfiniteScroll } from "./use-infinite-scroll";

interface ConversationVault {
	/** Null until the counts arrive; a row shows no number rather than a wrong one. */
	summary: ConversationVaultSummaryDTO | null;
	attachments: AttachmentWithMessageDTO[];
	links: MessageLinkDTO[];
	saved: MessageSearchResultDTO[];
	isLoading: boolean;
	error: string;
	hasMore: boolean;
	nextCursor: string | undefined;
	loadMoreRef: RefObject<HTMLDivElement>;
	loadPage: (before?: string, replace?: boolean) => Promise<void>;
	removeSaved: (messageId: string) => Promise<void>;
}

const PAGE_SIZE = 40;

/**
 * Everything the details panel reads, so the panel itself is about layout.
 *
 * Two requests with different lifetimes live here. The **summary** is fetched
 * once per conversation and is what the category list renders; a **page** is
 * fetched only for the category that is open, which is why `activeTab` may be
 * null. Opening the panel used to fetch forty images and their thumbnails
 * whether or not anybody wanted to look at photos.
 *
 * `requestSequence` is what makes switching categories safe: two pages in flight
 * can finish in either order, and without it the slower one appends its rows
 * under the wrong heading.
 */
export function useConversationVault(conversationId: string, activeTab: VaultTab | null): ConversationVault {
	const [summary, setSummary] = useState<ConversationVaultSummaryDTO | null>(null);
	const [attachments, setAttachments] = useState<AttachmentWithMessageDTO[]>([]);
	const [links, setLinks] = useState<MessageLinkDTO[]>([]);
	const [saved, setSaved] = useState<MessageSearchResultDTO[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const [hasMore, setHasMore] = useState(false);
	const [nextCursor, setNextCursor] = useState<string | undefined>();
	const requestSequence = useRef(0);

	const loadPage = useCallback(
		async (before?: string, replace = false) => {
			if (!activeTab || activeTab === "members") return;
			const sequence = ++requestSequence.current;
			setIsLoading(true);
			setError("");
			try {
				if (activeTab === "links") {
					const page = await api.listConversationLinks(conversationId, PAGE_SIZE, before);
					if (sequence !== requestSequence.current) return;
					setLinks((current) => (replace ? page.items : [...current, ...page.items]));
					setNextCursor(page.items.at(-1)?.id);
					setHasMore(page.hasMore);
				} else if (activeTab === "saved") {
					// Scoped by the server. Filtering an account-wide page here is what
					// used to make this tab open empty for anybody who saves messages in
					// more than one conversation.
					const page = await api.listSavedMessages(PAGE_SIZE, before, conversationId);
					if (sequence !== requestSequence.current) return;
					setSaved((current) => (replace ? page.results : [...current, ...page.results]));
					setNextCursor(page.results.at(-1)?.message.id);
					setHasMore(page.hasMore);
				} else {
					const kind = activeTab === "media" ? "image" : activeTab === "files" ? "file" : "audio";
					const page = await api.listConversationMedia(conversationId, kind, PAGE_SIZE, before);
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
		[activeTab, conversationId],
	);

	const loadMoreRef = useInfiniteScroll<HTMLDivElement>(hasMore && Boolean(nextCursor), isLoading, () => {
		if (nextCursor) void loadPage(nextCursor);
	});

	useEffect(() => {
		let isCurrent = true;
		setSummary(null);
		api.getConversationVaultSummary(conversationId)
			.then((next) => {
				if (isCurrent) setSummary(next);
			})
			// Swallowed on purpose: the categories are still reachable without their
			// counts, and an error banner over a list that works would be noise.
			.catch(() => undefined);

		return () => {
			isCurrent = false;
		};
	}, [conversationId]);

	useEffect(() => {
		setAttachments([]);
		setLinks([]);
		setSaved([]);
		setNextCursor(undefined);
		setHasMore(false);
		void loadPage(undefined, true);
	}, [loadPage]);

	const removeSaved = useCallback(
		async (messageId: string) => {
			await api.removeSavedMessage(conversationId, messageId);
			setSaved((current) => current.filter((item) => item.message.id !== messageId));
			// The count is on the category the reader is about to walk back to, so it
			// has to move now. Re-fetching the summary for one decrement would be a
			// round trip to learn something already known.
			setSummary((current) => (current ? { ...current, saved: Math.max(0, current.saved - 1) } : current));
		},
		[conversationId],
	);

	return {
		summary,
		attachments,
		links,
		saved,
		isLoading,
		error,
		hasMore,
		nextCursor,
		loadMoreRef,
		loadPage,
		removeSaved,
	};
}
