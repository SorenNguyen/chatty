import { useEffect, useRef, useState } from "react";
import { CornerUpLeft, X } from "lucide-react";
import type { MessageDTO } from "@chatty/shared-types";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { MAX_ATTACHMENTS_PER_MESSAGE } from "../constants/attachment";
import { DELETED_AUTHOR_NAME } from "../constants/message";
import { getAttachmentPreviewText } from "../utils";
import { useTypingNotifier } from "../hooks";
import { ComposerAttachments } from "./composer-attachments";
import { ComposerControls } from "./composer-controls";

interface MessageInputProps {
	conversationId: string;
	/** The message being answered, or null for an ordinary send. Owned by the page. */
	replyTo: MessageDTO | null;
	onCancelReply: () => void;
	/**
	 * Owned by the page, because a text message appears in the thread before the
	 * server has it and the thread is this component's sibling. A send carrying
	 * an image still resolves only once it is stored — see `useConversationMessages`.
	 */
	onSend: (
		content: string,
		attachments: File[],
		replyTo: MessageDTO | null,
		onProgress?: (percent: number) => void,
	) => Promise<void>;
	/** Sends a saved sticker. Its own path because a sticker is the whole message. */
	onSendSticker: (stickerId: string, replyTo: MessageDTO | null) => Promise<void>;
}

/**
 * The composer: one bordered block with the field on top and its controls under
 * it, rather than a row of a pill, a paperclip and a circle. The block is the
 * same shape as the bubbles above it, which is what makes writing look like the
 * beginning of the thread rather than a separate piece of furniture.
 */
export function MessageInput({ conversationId, replyTo, onCancelReply, onSend, onSendSticker }: MessageInputProps) {
	const [content, setContent] = useState("");
	const [attachments, setAttachments] = useState<File[]>([]);
	const [previewUrls, setPreviewUrls] = useState<string[]>([]);
	const [isSending, setIsSending] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [error, setError] = useState("");
	const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
	const [isStickerTrayOpen, setIsStickerTrayOpen] = useState(false);
	const fieldRef = useRef<HTMLInputElement>(null);
	const { notifyTyping, stopTyping } = useTypingNotifier(conversationId);

	// A message is allowed to be pictures with nothing written on them.
	const hasSomethingToSend = Boolean(content.trim()) || attachments.length > 0;
	const isFull = attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE;

	// Each preview is an object URL, which holds its file in memory until it is
	// revoked. Doing that in the cleanup rather than at send time covers the two
	// cases a send does not: removing one, and navigating away with some still
	// attached. The whole set is rebuilt whenever the list changes — cheap, and
	// it makes the revoke a single obvious line rather than per-file bookkeeping.
	useEffect(() => {
		const objectUrls = attachments.map((file) => URL.createObjectURL(file));
		setPreviewUrls(objectUrls);

		return () => objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
	}, [attachments]);

	function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
		setContent(event.target.value);
		notifyTyping();
	}

	function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
		const picked = [...(event.target.files ?? [])];
		// Resetting the input is what makes picking the same file twice work: the
		// change event does not fire when the value is unchanged, so re-attaching
		// after removing would do nothing.
		event.target.value = "";
		if (picked.length === 0) return;

		// Appended rather than replacing, so a second trip to the file dialog adds
		// to the set. Trimmed here as well as on the server: refusing before the
		// upload is the difference between a sentence and ten megabytes.
		setAttachments((current) => [...current, ...picked].slice(0, MAX_ATTACHMENTS_PER_MESSAGE));
		setError(
			picked.length + attachments.length > MAX_ATTACHMENTS_PER_MESSAGE
				? `A message may carry at most ${MAX_ATTACHMENTS_PER_MESSAGE} images`
				: "",
		);
	}

	/**
	 * Puts an emoji where the caret is, not on the end.
	 *
	 * Appending is the version that looks fine until somebody goes back to fix a
	 * word and their next emoji lands three sentences away from where they are
	 * looking. Focus and the caret are restored afterwards, so the picker can be
	 * used several times in a row without reaching for the field between each.
	 */
	function insertEmoji(char: string) {
		const field = fieldRef.current;
		const caret = field?.selectionStart ?? content.length;
		const next = `${content.slice(0, caret)}${char}${content.slice(field?.selectionEnd ?? caret)}`;

		setContent(next);
		notifyTyping();
		// After the render that applies `next`, or the caret is set against the old
		// value and lands in the wrong place.
		requestAnimationFrame(() => {
			field?.focus();
			field?.setSelectionRange(caret + char.length, caret + char.length);
		});
	}

	function sendSticker(stickerId: string) {
		// Closed on send: a sticker is the whole message, so there is nothing left
		// to compose and a tray still covering the thread hides what was just sent.
		setIsStickerTrayOpen(false);
		stopTyping();
		const target = replyTo;
		onCancelReply();
		void onSendSticker(stickerId, target);
	}

	function removeAttachment(index: number) {
		setAttachments((current) => current.filter((_, position) => position !== index));
		setError("");
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!hasSomethingToSend) return;

		// Retracted before the send, not after: the message itself is what tells
		// the other side you finished, and leaving "typing…" up while the request
		// is in flight makes a slow network look like a second message coming.
		stopTyping();
		setError("");

		const draftContent = content.trim();
		const draftReplyTo = replyTo;

		// A text-only send empties the composer *before* the round trip, because
		// the message is already in the thread by then — the whole point of the
		// optimistic bubble is that writing the next one does not wait on the
		// network. A failed send is reported on that bubble, not here.
		if (attachments.length === 0) {
			setContent("");
			onCancelReply();
			await onSend(draftContent, [], draftReplyTo);

			return;
		}

		// Images still resolve only once they are stored, so the composer keeps
		// the files and their progress bar until then.
		setIsSending(true);
		setUploadProgress(0);
		try {
			await onSend(draftContent, attachments, draftReplyTo, setUploadProgress);
			setContent("");
			setAttachments([]);
			// Cleared only on success, alongside the text. A reply that failed to
			// send still has a target, and making the sender re-pick it after a
			// dropped connection loses the one piece of context they chose.
			onCancelReply();
		} catch (sendError) {
			// The file is kept on failure — re-picking it after a dropped
			// connection is the most annoying possible way to lose a photo.
			setError((sendError as Error).message);
		} finally {
			setIsSending(false);
		}
	}

	return (
		<div className="shrink-0 bg-paper px-3 pb-3 pt-2 sm:px-5 sm:pb-4 md:px-7 md:pb-6">
			<form
				onSubmit={handleSubmit}
				className={cn(
					"flex flex-col rounded-bubble border bg-paper-raised focus-within:border-ink-faint",
					replyTo ? "border-ink-faint" : "border-rule",
				)}
			>
				{replyTo && (
					<div className="flex items-start gap-2.5 border-b border-rule-soft px-4 py-2.5">
						<CornerUpLeft aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
						<div className="flex min-w-0 flex-col gap-0.5">
							<span className="eyebrow text-ink-faint">
								Replying to {replyTo.author?.displayName ?? DELETED_AUTHOR_NAME}
							</span>
							<span className="truncate text-[12.5px]/[1.45] text-ink-soft">
								{replyTo.content ||
									(replyTo.attachments.length > 0
										? getAttachmentPreviewText(replyTo.attachments.length)
										: "")}
							</span>
						</div>
						{replyTo.attachments[0] && (
							<img
								src={replyTo.attachments[0].url}
								alt=""
								className="ml-auto size-10 shrink-0 rounded-control border border-rule object-cover"
							/>
						)}
						<Button
							variant="ghost"
							onClick={onCancelReply}
							aria-label="Cancel reply"
							className={cn(
								"size-6 shrink-0 p-0 text-ink-faint hover:bg-transparent hover:text-ink",
								replyTo.attachments.length === 0 && "ml-auto",
							)}
						>
							<X className="size-3.5" />
						</Button>
					</div>
				)}

				{error && (
					<p role="alert" className="eyebrow border-b border-rule-soft px-4 py-2.5 text-signal">
						{error}
					</p>
				)}

				{isSending && attachments.length > 0 && (
					<div className="px-4 pt-3" role="status" aria-label={`Uploading images ${uploadProgress}%`}>
						<div className="mb-1.5 flex justify-between">
							<span className="eyebrow text-ink-faint">
								{attachments.length > 1 ? `Uploading ${attachments.length} images` : "Uploading image"}
							</span>
							<span className="meta text-ink-faint">{uploadProgress}%</span>
						</div>
						<div className="h-[3px] overflow-hidden rounded-badge bg-rule-soft">
							<div className="h-full bg-ink transition-[width]" style={{ width: `${uploadProgress}%` }} />
						</div>
					</div>
				)}

				{previewUrls.length > 0 && (
					<ComposerAttachments previewUrls={previewUrls} onRemove={removeAttachment} />
				)}

				<input
					ref={fieldRef}
					value={content}
					onChange={handleChange}
					placeholder="Write a message"
					aria-label="Message"
					className="bg-transparent px-4 pb-2.5 pt-3.5 text-sm text-ink outline-none placeholder:text-ink-faint"
				/>

				<ComposerControls
					isSending={isSending}
					isFull={isFull}
					canSend={hasSomethingToSend}
					isEmojiPickerOpen={isEmojiPickerOpen}
					isStickerTrayOpen={isStickerTrayOpen}
					onToggleEmojiPicker={() => {
						setIsStickerTrayOpen(false);
						setIsEmojiPickerOpen((current) => !current);
					}}
					onToggleStickerTray={() => {
						setIsEmojiPickerOpen(false);
						setIsStickerTrayOpen((current) => !current);
					}}
					onCloseEmojiPicker={() => setIsEmojiPickerOpen(false)}
					onCloseStickerTray={() => setIsStickerTrayOpen(false)}
					onFilesSelected={handleFilesSelected}
					onInsertEmoji={insertEmoji}
					onPickSticker={sendSticker}
				/>
			</form>
		</div>
	);
}
