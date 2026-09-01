import type { AttachmentWithMessageDTO, MessageLinkDTO, MessageSearchResultDTO } from "@chatty/shared-types";
import type { RefObject } from "react";
import { useMemo, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import type { VaultTab } from "../constants/vault";
import { formatLinkSource, formatVaultDate, groupVaultMedia } from "../utils/vault";
import { AttachmentLightbox } from "./attachment-lightbox";
import { MessageFileCard } from "./message-file-card";
import { VaultEmptyState } from "./vault-empty-state";
import { VoicePlayer } from "./voice-player";

interface VaultTabContentProps {
	activeTab: Exclude<VaultTab, "members">;
	conversationId: string;
	attachments: AttachmentWithMessageDTO[];
	links: MessageLinkDTO[];
	saved: MessageSearchResultDTO[];
	setSaved: React.Dispatch<React.SetStateAction<MessageSearchResultDTO[]>>;
	isLoading: boolean;
	error: string;
	hasMore: boolean;
	nextCursor: string | undefined;
	loadMoreRef: RefObject<HTMLDivElement>;
	onLoadPage: (before?: string, replace?: boolean) => Promise<void>;
	onOpenMessage: (messageId: string) => void;
}

export function VaultTabContent({
	activeTab,
	conversationId,
	attachments,
	links,
	saved,
	setSaved,
	isLoading,
	error,
	hasMore,
	nextCursor,
	loadMoreRef,
	onLoadPage,
	onOpenMessage,
}: VaultTabContentProps) {
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
	const mediaGroups = useMemo(() => groupVaultMedia(attachments), [attachments]);
	const isEmpty =
		activeTab === "links"
			? links.length === 0
			: activeTab === "saved"
				? saved.length === 0
				: attachments.length === 0;

	return (
		<>
			{isLoading && isEmpty && <p className="eyebrow text-ink-faint">Loading…</p>}
			{error && (
				<div className="flex items-center justify-between gap-3">
					<p role="alert" className="eyebrow text-signal">
						{error}
					</p>
					<Button variant="ghost" onClick={() => void onLoadPage(nextCursor, isEmpty)} className="px-2">
						Retry
					</Button>
				</div>
			)}
			{!isLoading && isEmpty && !hasMore && !error && <VaultEmptyState tab={activeTab} />}

			{activeTab === "media" && (
				<div className="flex flex-col gap-5">
					{mediaGroups.map(([month, items]) => (
						<section key={month}>
							<h3 className="eyebrow mb-2 text-ink-faint">{month}</h3>
							<div className="grid grid-cols-3 gap-1">
								{items.map((attachment) => (
									<Button
										key={attachment.id}
										variant="ghost"
										onClick={() =>
											setLightboxIndex(attachments.findIndex((item) => item.id === attachment.id))
										}
										className="aspect-square overflow-hidden rounded-sm p-0"
									>
										<img
											src={attachment.thumbUrl ?? attachment.url}
											alt={`Shared by ${attachment.authorName ?? "Deleted account"}`}
											className="size-full object-cover transition duration-200 hover:scale-[1.02]"
										/>
									</Button>
								))}
							</div>
						</section>
					))}
				</div>
			)}

			{activeTab === "files" && (
				<div className="flex flex-col gap-3">
					{attachments.map((attachment) => (
						<div key={attachment.id}>
							<MessageFileCard attachment={attachment} className="w-full max-w-none" />
							<p className="meta mt-1 px-1 text-ink-faint">
								{attachment.authorName ?? "Deleted account"} ·{" "}
								{formatVaultDate(attachment.messageCreatedAt)}
							</p>
						</div>
					))}
				</div>
			)}

			{activeTab === "voice" && (
				<div className="flex flex-col gap-3">
					{attachments.map((attachment) => (
						<div key={attachment.id}>
							<VoicePlayer attachment={attachment} className="w-full max-w-none" />
							<p className="meta mt-1 px-1 text-ink-faint">
								{attachment.authorName ?? "Deleted account"} ·{" "}
								{formatVaultDate(attachment.messageCreatedAt)}
							</p>
						</div>
					))}
				</div>
			)}

			{activeTab === "links" && (
				<div className="flex flex-col gap-3">
					{links.map((link) => (
						<Button
							key={link.id}
							variant="ghost"
							onClick={() => onOpenMessage(link.messageId)}
							className="block min-w-0 text-left"
						>
							<span className="meta block truncate text-ink-soft">{formatLinkSource(link.url)}</span>
							<span className="block truncate text-sm text-ink">{link.url}</span>
							<span className="meta mt-1 block text-ink-faint">
								{link.authorName ?? "Deleted account"} · {formatVaultDate(link.createdAt)}
							</span>
						</Button>
					))}
				</div>
			)}

			{activeTab === "saved" && (
				<div className="flex flex-col gap-2">
					{saved.map((item) => (
						<div key={item.message.id} className="flex items-center gap-1">
							<Button
								variant="ghost"
								onClick={() => onOpenMessage(item.message.id)}
								className="min-w-0 flex-1 justify-start truncate text-left text-sm"
							>
								{item.message.content || "Attachment"}
							</Button>
							<Button
								variant="ghost"
								onClick={() => {
									void api
										.removeSavedMessage(conversationId, item.message.id)
										.then(() =>
											setSaved((current) =>
												current.filter((savedItem) => savedItem.message.id !== item.message.id),
											),
										);
								}}
								className="shrink-0 px-2 text-xs text-ink-faint"
							>
								Remove
							</Button>
						</div>
					))}
				</div>
			)}

			{hasMore && !isLoading && (
				<Button
					variant="outline"
					onClick={() => void onLoadPage(nextCursor)}
					disabled={!nextCursor}
					className="mt-4 w-full"
				>
					Load more
				</Button>
			)}
			<div ref={loadMoreRef} aria-hidden="true" className="h-px" />
			{isLoading && !isEmpty && <p className="eyebrow py-3 text-center text-ink-faint">Loading more…</p>}

			{lightboxIndex !== null && (
				<AttachmentLightbox
					key={attachments[lightboxIndex]?.id}
					attachments={attachments}
					initialIndex={lightboxIndex}
					caption="Shared image"
					onClose={() => setLightboxIndex(null)}
					onOpenMessage={(attachment) => {
						setLightboxIndex(null);
						const item = attachments.find((candidate) => candidate.id === attachment.id);
						if (item) onOpenMessage(item.messageId);
					}}
				/>
			)}
		</>
	);
}
