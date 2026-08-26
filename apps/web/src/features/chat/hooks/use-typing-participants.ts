import type { TypingEvent } from "@chatty/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { TYPING_EXPIRY_MS } from "../constants/typing";
import { useSocketEvent } from "./use-socket-event";

/**
 * Who is currently typing in the open conversation.
 *
 * Every typer carries an expiry timer, because a "stopped typing" message is
 * not guaranteed to arrive — the sender may close their laptop mid-sentence.
 * Without the timer the indicator would stay lit until the page reloaded.
 *
 * Timers rather than a polling interval: an interval would tick for the whole
 * session to catch an event that happens rarely, while a timer only exists
 * while someone is actually typing.
 */
export function useTypingParticipants(conversationId: string | null): string[] {
	const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
	const expiryTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

	const forgetTyper = useCallback((userId: string) => {
		const timer = expiryTimers.current.get(userId);
		if (timer) clearTimeout(timer);

		expiryTimers.current.delete(userId);
		setTypingUserIds((current) => current.filter((typingUserId) => typingUserId !== userId));
	}, []);

	useSocketEvent(
		"typing:update",
		useCallback(
			(event: TypingEvent) => {
				// Events arrive for every conversation the user is in, not just the
				// one on screen. Someone typing in an unopened thread is not shown —
				// a badge for it would be noise for something that expires anyway.
				if (event.conversationId !== conversationId) return;

				if (!event.isTyping) {
					forgetTyper(event.userId);

					return;
				}

				const existingTimer = expiryTimers.current.get(event.userId);
				if (existingTimer) clearTimeout(existingTimer);
				expiryTimers.current.set(
					event.userId,
					setTimeout(() => forgetTyper(event.userId), TYPING_EXPIRY_MS),
				);

				setTypingUserIds((current) => (current.includes(event.userId) ? current : [...current, event.userId]));
			},
			[conversationId, forgetTyper],
		),
	);

	// Switching conversations drops everything: the previous thread's typers are
	// not typing *here*, and their pending timers would fire against a list they
	// no longer belong to.
	useEffect(() => {
		const timers = expiryTimers.current;

		return () => {
			for (const timer of timers.values()) clearTimeout(timer);
			timers.clear();
			setTypingUserIds([]);
		};
	}, [conversationId]);

	return typingUserIds;
}
