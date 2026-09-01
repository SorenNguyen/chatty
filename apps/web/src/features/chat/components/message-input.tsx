import type { ChangeEvent, FormEvent } from "react";
import { useCallback, useRef, useState } from "react";
import type { MessageDTO, ParticipantDTO } from "@chatty/shared-types";
import { cn } from "@/utils/cn";
import { useTypingNotifier } from "../hooks";
import { useComposerAttachments } from "../hooks/use-composer-attachments";
import { useMessageDraft } from "../hooks/use-message-draft";
import { ComposerControls } from "./composer-controls";
import { ComposerMentionSuggestions } from "./composer-mention-suggestions";
import { ComposerReplyPreview } from "./composer-reply-preview";
import { ComposerUploadPreview } from "./composer-upload-preview";
import { VoiceRecorder } from "./voice-recorder";

interface MessageInputProps {
	conversationId: string;
	participants: ParticipantDTO[];
	currentUserId: string;
	/** The message being answered, or null for an ordinary send. Owned by the page. */
	replyTo: MessageDTO | null;
	onCancelReply: () => void;
	/**
	 * Owned by the page, because a message appears in the thread before the
	 * server has it and the thread is this component's sibling. Pictures included
	 * as of phase 29 — see `useConversationMessages`, which measures them first so
	 * the gallery reserves the right box.
	 */
	onSend: (
		content: string,
		attachments: File[],
		replyTo: MessageDTO | null,
		mentionedUserIds?: string[],
	) => Promise<void>;
	/** Sends a saved sticker. Its own path because a sticker is the whole message. */
	onSendSticker: (stickerId: string, replyTo: MessageDTO | null) => Promise<void>;
	onSendFile: (
		file: File,
		content: string,
		replyTo: MessageDTO | null,
		onProgress?: (percent: number) => void,
	) => Promise<void>;
	onSendVoice: (recording: Blob, onProgress?: (percent: number) => void) => Promise<void>;
	onRestoreReply: (messageId: string) => void;
}

export function MessageInput({
	conversationId,
	participants,
	currentUserId,
	replyTo,
	onCancelReply,
	onSend,
	onSendSticker,
	onSendFile,
	onSendVoice,
	onRestoreReply,
}: MessageInputProps) {
	const [content, setContent] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [error, setError] = useState("");
	const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
	const [isStickerTrayOpen, setIsStickerTrayOpen] = useState(false);
	const [isVoiceActive, setIsVoiceActive] = useState(false);
	const fieldRef = useRef<HTMLInputElement>(null);
	const contentRef = useRef(content);
	contentRef.current = content;
	const { notifyTyping, stopTyping } = useTypingNotifier(conversationId);
	const {
		attachments,
		setAttachments,
		selectedFile,
		setSelectedFile,
		previewUrls,
		isDragActive,
		isFull,
		handleFilesSelected,
		handleFileSelected,
		handlePaste,
		removeAttachment,
	} = useComposerAttachments({ setError });
	const clearDraft = useMessageDraft({
		conversationId,
		content,
		replyToId: replyTo?.id ?? null,
		onRestore: useCallback(
			(draft) => {
				setContent(draft.content);
				if (draft.replyToId) onRestoreReply(draft.replyToId);
			},
			[onRestoreReply],
		),
		isPaused: isSending,
	});
	const mentionMatch = content.match(/(?:^|\s)@([a-z0-9_.-]*)$/iu);
	const mentionQuery = mentionMatch?.[1]?.toLowerCase();
	const mentionSuggestions = mentionMatch
		? participants
				.filter(
					(participant) =>
						participant.id !== currentUserId &&
						(participant.handle.includes(mentionQuery ?? "") ||
							participant.displayName.toLowerCase().includes(mentionQuery ?? "")),
				)
				.slice(0, 5)
		: [];

	// A message is allowed to be pictures with nothing written on them.
	const hasSomethingToSend = Boolean(content.trim()) || attachments.length > 0 || selectedFile !== null;

	function handleChange(event: ChangeEvent<HTMLInputElement>) {
		setContent(event.target.value);
		notifyTyping();
	}

	function insertMention(participant: ParticipantDTO) {
		if (!mentionMatch || mentionMatch.index === undefined) return;
		const leadingSpace = mentionMatch[0].startsWith(" ") ? " " : "";
		setContent(`${content.slice(0, mentionMatch.index)}${leadingSpace}@${participant.handle} `);
		requestAnimationFrame(() => fieldRef.current?.focus());
	}

	/** Inserts at the caret and restores focus after the controlled field renders. */
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
		void onSendSticker(stickerId, target).then(() => {
			clearDraft();
			onCancelReply();
		});
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!hasSomethingToSend) return;

		// Retract before the request: a slow network must not leave "typing…" behind.
		stopTyping();
		setError("");

		const draftContent = content.trim();
		const draftReplyTo = replyTo;
		const mentionedUserIds = participants
			.filter((participant) =>
				new RegExp(`(^|\\s)@${participant.handle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?=\\s|$)`, "iu").test(
					draftContent,
				),
			)
			.map((participant) => participant.id);

		// A text-only send empties the composer *before* the round trip, because
		// the message is already in the thread by then — the whole point of the
		// optimistic bubble is that writing the next one does not wait on the
		// network. A failed send is reported on that bubble, not here.
		if (selectedFile) {
			setIsSending(true);
			setUploadProgress(0);
			try {
				await onSendFile(selectedFile, draftContent, draftReplyTo, setUploadProgress);
				setSelectedFile(null);
				setContent("");
				clearDraft();
				onCancelReply();
			} catch (caught) {
				setError(caught instanceof Error ? caught.message : "The file could not be sent");
			} finally {
				setIsSending(false);
			}

			return;
		}

		if (attachments.length === 0) {
			localStorage.setItem(
				`chatty:draft:${conversationId}`,
				JSON.stringify({ content: draftContent, replyToId: draftReplyTo?.id ?? null }),
			);
			setContent("");
			try {
				await onSend(draftContent, [], draftReplyTo, mentionedUserIds);
				if (contentRef.current === "") clearDraft();
				onCancelReply();
			} catch (sendError) {
				setContent(draftContent);
				setError(sendError instanceof Error ? sendError.message : "The message could not be sent");
			}

			return;
		}

		// Pictures now empty the composer up front, exactly as text does. They
		// used to be held here behind a progress bar until the upload landed,
		// which meant the previews and the bubble were never on screen together —
		// and it also meant a failed photo was reported in two places at once.
		// It is reported on the bubble now, which is where the retry is.
		setContent("");
		setAttachments([]);
		clearDraft();
		onCancelReply();
		try {
			await onSend(draftContent, attachments, draftReplyTo, mentionedUserIds);
		} catch {
			// Swallowed on purpose: the draft in the thread is already showing
			// "Not sent" with a retry beside it, and a second copy of the same
			// news in a composer the sender has moved on from is noise.
		}
	}

	return (
		<div className="shrink-0 border-t border-rule-soft bg-paper-raised px-3 py-2.5 sm:px-4 md:px-5">
			<form
				onSubmit={handleSubmit}
				className={cn(
					"relative flex flex-col gap-2 rounded-panel transition",
					isDragActive && "bg-signal-soft p-2 ring-2 ring-signal/20",
				)}
			>
				{replyTo && <ComposerReplyPreview replyTo={replyTo} onCancel={onCancelReply} />}
				<ComposerUploadPreview
					error={error}
					isSending={isSending}
					uploadProgress={uploadProgress}
					attachments={attachments}
					previewUrls={previewUrls}
					selectedFile={selectedFile}
					onRemoveImage={removeAttachment}
					onRemoveFile={() => {
						setSelectedFile(null);
						setError("");
					}}
				/>

				<ComposerMentionSuggestions participants={mentionSuggestions} onPick={insertMention} />

				<ComposerControls
					isSending={isSending || isVoiceActive}
					isVoiceActive={isVoiceActive}
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
					onFileSelected={handleFileSelected}
					onInsertEmoji={insertEmoji}
					onPickSticker={sendSticker}
					field={
						<input
							ref={fieldRef}
							value={content}
							onChange={handleChange}
							onPaste={handlePaste}
							disabled={isVoiceActive}
							placeholder="Write a message"
							aria-label="Message"
							className="min-w-0 flex-1 bg-transparent px-2.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint"
						/>
					}
					voiceRecorder={
						<VoiceRecorder
							isDisabled={isSending || hasSomethingToSend || replyTo !== null}
							onSend={onSendVoice}
							onActiveChange={setIsVoiceActive}
						/>
					}
				/>
			</form>
		</div>
	);
}
