import { useEffect, useRef } from "react";

interface MessageDraft {
	content: string;
	replyToId: string | null;
}

interface UseMessageDraftOptions {
	conversationId: string;
	content: string;
	replyToId: string | null;
	onRestore: (draft: MessageDraft) => void;
	isPaused?: boolean;
}

/** Device-local by design: unsent words are not silently synchronized to another session. */
export function useMessageDraft({
	conversationId,
	content,
	replyToId,
	onRestore,
	isPaused = false,
}: UseMessageDraftOptions) {
	const isRestored = useRef(false);
	const onRestoreRef = useRef(onRestore);
	const latestDraftRef = useRef<MessageDraft>({ content, replyToId });
	onRestoreRef.current = onRestore;
	latestDraftRef.current = { content, replyToId };

	useEffect(() => {
		isRestored.current = false;
		const raw = localStorage.getItem(`chatty:draft:${conversationId}`);
		if (raw) {
			try {
				onRestoreRef.current(JSON.parse(raw) as MessageDraft);
			} catch {
				localStorage.removeItem(`chatty:draft:${conversationId}`);
			}
		} else onRestoreRef.current({ content: "", replyToId: null });
		isRestored.current = true;

		return () => {
			const latest = latestDraftRef.current;
			const key = `chatty:draft:${conversationId}`;
			if (latest.content || latest.replyToId) localStorage.setItem(key, JSON.stringify(latest));
			else localStorage.removeItem(key);
		};
	}, [conversationId]);

	useEffect(() => {
		if (!isRestored.current || isPaused) return;
		const key = `chatty:draft:${conversationId}`;
		const timer = window.setTimeout(() => {
			if (content || replyToId) localStorage.setItem(key, JSON.stringify({ content, replyToId }));
			else localStorage.removeItem(key);
		}, 250);

		return () => window.clearTimeout(timer);
	}, [conversationId, content, replyToId, isPaused]);

	return () => {
		latestDraftRef.current = { content: "", replyToId: null };
		localStorage.removeItem(`chatty:draft:${conversationId}`);
	};
}
