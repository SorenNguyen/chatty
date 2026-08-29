import { useEffect, useRef, useState } from "react";
import { ImagePlus, SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/button";
import { api } from "@/api/client";
import { ACCEPTED_IMAGE_TYPES } from "../constants/attachment";
import { useTypingNotifier } from "../hooks";

interface MessageInputProps {
	conversationId: string;
}

export function MessageInput({ conversationId }: MessageInputProps) {
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
			await api.sendMessage(conversationId, content.trim(), attachment ?? undefined, setUploadProgress);
			// Deliberately no local append: the server broadcasts this message back
			// over the socket, and rendering from that one source keeps the sender's
			// view on the same code path as everyone else's. Appending here too
			// would show it twice.
			setContent("");
			setAttachment(null);
		} catch (sendError) {
			// The file is kept on failure — re-picking it after a dropped
			// connection is the most annoying possible way to lose a photo.
			setError((sendError as Error).message);
		} finally {
			setIsSending(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="shrink-0 px-6 pb-6">
			{/* One bordered block holding the field and its controls, rather than a
			    row of separate rounded pills. The composer is one object you type
			    into; three floating capsules made it read as three. */}
			<div className="rounded-lg border border-rule bg-paper-raised focus-within:border-ink">
				{error && <p className="eyebrow border-b border-rule-soft px-4 py-2.5 text-signal">{error}</p>}

				{isSending && attachment && (
					<div
						className="border-b border-rule-soft px-4 py-2.5"
						role="status"
						aria-label={`Uploading image ${uploadProgress}%`}
					>
						<div className="mb-1.5 flex justify-between">
							<span className="eyebrow text-ink-faint">Uploading image</span>
							<span className="meta text-ink-faint">{uploadProgress}%</span>
						</div>
						<div className="h-0.5 overflow-hidden bg-rule">
							{/* Inline width because the value is a number from a running
							    upload — there is no class for 37%. Flagged rather than
							    hidden: the production CSP is `style-src 'self'`, which
							    blocks inline style attributes, so this bar does not move
							    in a deployed build. Pre-existing; see the note in
							    nginx.conf.template. */}
							<div className="h-full bg-ink transition-[width]" style={{ width: `${uploadProgress}%` }} />
						</div>
					</div>
				)}

				{previewUrl && (
					<div className="relative m-3 mb-0 inline-block">
						<img src={previewUrl} alt="Attached image preview" className="h-20 rounded-md object-cover" />
						<Button
							variant="ghost"
							onClick={() => setAttachment(null)}
							aria-label="Remove attached image"
							className="absolute -right-2 -top-2 size-5 rounded-md border border-rule bg-paper-raised p-0 text-ink-soft hover:bg-paper"
						>
							<X className="size-3" strokeWidth={2} />
						</Button>
					</div>
				)}

				<input
					value={content}
					onChange={handleChange}
					placeholder="Write a message"
					aria-label="Message"
					className="w-full bg-transparent px-4 pb-2.5 pt-3.5 text-sm text-ink outline-none placeholder:text-ink-faint"
				/>

				<div className="flex items-center justify-between px-2.5 pb-2.5">
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
						className="size-7 rounded-md p-0"
					>
						<ImagePlus className="size-4" strokeWidth={1.75} />
					</Button>

					<div className="flex items-center gap-3">
						{/* The keyboard shortcut said out loud. It is the fastest path and
						    the one nobody discovers by looking at a send button. */}
						<span className="eyebrow text-ink-faint max-sm:hidden">Enter to send</span>
						<Button
							type="submit"
							disabled={isSending || !hasSomethingToSend}
							aria-label="Send message"
							className="size-8 rounded-md p-0"
						>
							<SendHorizontal className="size-4" strokeWidth={1.75} />
						</Button>
					</div>
				</div>
			</div>
		</form>
	);
}
