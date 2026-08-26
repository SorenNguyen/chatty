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
		setError("");
		try {
			await api.sendMessage(conversationId, content.trim(), attachment ?? undefined);
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
		<form onSubmit={handleSubmit} className="border-t border-slate-200 p-3">
			{error && <p className="mb-2 text-xs text-red-600">{error}</p>}

			{previewUrl && (
				<div className="relative mb-2 inline-block">
					<img src={previewUrl} alt="Attached image preview" className="h-20 rounded-lg object-cover" />
					<Button
						variant="ghost"
						onClick={() => setAttachment(null)}
						aria-label="Remove attached image"
						className="absolute -right-2 -top-2 size-5 rounded-full border border-slate-200 bg-white p-0 text-slate-500 hover:bg-slate-100"
					>
						<X className="size-3" />
					</Button>
				</div>
			)}

			<div className="flex items-center gap-2">
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
					className="rounded-full px-2"
				>
					<ImagePlus className="size-4" />
				</Button>

				<input
					value={content}
					onChange={handleChange}
					placeholder="Type a message"
					aria-label="Message"
					className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
				/>
				<Button type="submit" disabled={isSending || !hasSomethingToSend} className="rounded-full px-3">
					<SendHorizontal className="size-4" />
				</Button>
			</div>
		</form>
	);
}
