import { useEffect, useRef, useState } from "react";
import { ArrowUp, CornerUpLeft, ImagePlus, X } from "lucide-react";
import type { MessageDTO } from "@chatty/shared-types";
import { Button } from "@/components/button";
import { api } from "@/api/client";
import { cn } from "@/utils/cn";
import { ACCEPTED_IMAGE_TYPES } from "../constants/attachment";
import { ATTACHMENT_PREVIEW_TEXT, DELETED_AUTHOR_NAME } from "../constants/message";
import { useTypingNotifier } from "../hooks";

interface MessageInputProps {
	conversationId: string;
	/** The message being answered, or null for an ordinary send. Owned by the page. */
	replyTo: MessageDTO | null;
	onCancelReply: () => void;
}

/**
 * The composer: one bordered block with the field on top and its controls under
 * it, rather than a row of a pill, a paperclip and a circle. The block is the
 * same shape as the bubbles above it, which is what makes writing look like the
 * beginning of the thread rather than a separate piece of furniture.
 */
export function MessageInput({ conversationId, replyTo, onCancelReply }: MessageInputProps) {
	const [content, setContent] = useState("");
	const [attachment, setAttachment] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [error, setError] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { notifyTyping, stopTyping } = useTypingNotifier(conversationId);

	// A message is now allowed to be a picture with nothing written on it.
	const hasSomethingToSend = Boolean(content.trim() || attachment);

	// The preview is an object URL, which holds the file in memory until it is
	// revoked. Doing that in the cleanup rather than at send time covers the two
	// cases a send does not: swapping the picture for another, and navigating
	// away with one still attached.
	useEffect(() => {
		if (!attachment) {
			setPreviewUrl("");

			return;
		}

		const objectUrl = URL.createObjectURL(attachment);
		setPreviewUrl(objectUrl);

		return () => URL.revokeObjectURL(objectUrl);
	}, [attachment]);

	function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
		setContent(event.target.value);
		notifyTyping();
	}

	function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0] ?? null;
		// Resetting the input is what makes picking the same file twice work: the
		// change event does not fire when the value is unchanged, so re-attaching
		// after removing would do nothing.
		event.target.value = "";
		if (file) setAttachment(file);
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!hasSomethingToSend) return;

		// Retracted before the send, not after: the message itself is what tells
		// the other side you finished, and leaving "typing…" up while the request
		// is in flight makes a slow network look like a second message coming.
		stopTyping();
		setIsSending(true);
		setUploadProgress(0);
		setError("");
		try {
			await api.sendMessage(
				conversationId,
				content.trim(),
				attachment ?? undefined,
				setUploadProgress,
				replyTo?.id,
			);
			// Deliberately no local append: the server broadcasts this message back
			// over the socket, and rendering from that one source keeps the sender's
			// view on the same code path as everyone else's. Appending here too
			// would show it twice.
			setContent("");
			setAttachment(null);
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
								{replyTo.content || (replyTo.attachment ? ATTACHMENT_PREVIEW_TEXT : "")}
							</span>
						</div>
						{replyTo.attachment && (
							<img
								src={replyTo.attachment.url}
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
								!replyTo.attachment && "ml-auto",
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

				{isSending && attachment && (
					<div className="px-4 pt-3" role="status" aria-label={`Uploading image ${uploadProgress}%`}>
						<div className="mb-1.5 flex justify-between">
							<span className="eyebrow text-ink-faint">Uploading image</span>
							<span className="meta text-ink-faint">{uploadProgress}%</span>
						</div>
						<div className="h-[3px] overflow-hidden rounded-badge bg-rule-soft">
							<div className="h-full bg-ink transition-[width]" style={{ width: `${uploadProgress}%` }} />
						</div>
					</div>
				)}

				{previewUrl && (
					<div className="relative m-4 mb-0 inline-block w-fit">
						<img
							src={previewUrl}
							alt="Attached image preview"
							className="h-20 rounded-control border border-rule object-cover"
						/>
						<Button
							variant="ghost"
							onClick={() => setAttachment(null)}
							aria-label="Remove attached image"
							className="absolute -right-2 -top-2 size-5 rounded-badge border border-rule bg-paper-raised p-0 text-ink-soft"
						>
							<X className="size-3" />
						</Button>
					</div>
				)}

				<input
					value={content}
					onChange={handleChange}
					placeholder="Write a message"
					aria-label="Message"
					className="bg-transparent px-4 pb-2.5 pt-3.5 text-sm text-ink outline-none placeholder:text-ink-faint"
				/>

				<div className="flex items-center justify-between gap-3 px-2.5 pb-2.5">
					<input
						ref={fileInputRef}
						type="file"
						accept={ACCEPTED_IMAGE_TYPES}
						onChange={handleFileSelected}
						className="hidden"
					/>
					<Button
						variant="ghost"
						onClick={() => fileInputRef.current?.click()}
						disabled={isSending}
						aria-label="Attach an image"
						className="size-7 shrink-0 p-0"
					>
						<ImagePlus className="size-4" />
					</Button>

					<div className="flex items-center gap-3">
						<span className="eyebrow text-ink-faint max-sm:hidden">Enter to send</span>
						<Button
							type="submit"
							disabled={isSending || !hasSomethingToSend}
							aria-label="Send message"
							className="size-8 shrink-0 p-0"
						>
							<ArrowUp className="size-4" />
						</Button>
					</div>
				</div>
			</form>
		</div>
	);
}
