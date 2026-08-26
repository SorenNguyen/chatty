import { useState } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/button";
import { api } from "@/api/client";
import { useTypingNotifier } from "../hooks";

interface MessageInputProps {
	conversationId: string;
}

export function MessageInput({ conversationId }: MessageInputProps) {
	const [content, setContent] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [error, setError] = useState("");
	const { notifyTyping, stopTyping } = useTypingNotifier(conversationId);

	function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
		setContent(event.target.value);
		notifyTyping();
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();

		const trimmed = content.trim();
		if (!trimmed) return;

		// Retracted before the send, not after: the message itself is what tells
		// the other side you finished, and leaving "typing…" up while the request
		// is in flight makes a slow network look like a second message coming.
		stopTyping();
		setIsSending(true);
		setError("");
		try {
			await api.sendMessage(conversationId, trimmed);
			// Deliberately no local append: the server broadcasts this message back
			// over the socket, and rendering from that one source keeps the sender's
			// view on the same code path as everyone else's. Appending here too
			// would show it twice.
			setContent("");
		} catch (sendError) {
			setError((sendError as Error).message);
		} finally {
			setIsSending(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="border-t border-slate-200 p-3">
			{error && <p className="mb-2 text-xs text-red-600">{error}</p>}
			<div className="flex items-center gap-2">
				<input
					value={content}
					onChange={handleChange}
					placeholder="Type a message"
					aria-label="Message"
					className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
				/>
				<Button type="submit" disabled={isSending || !content.trim()} className="rounded-full px-3">
					<SendHorizontal className="size-4" />
				</Button>
			</div>
		</form>
	);
}
