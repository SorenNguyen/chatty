import type { MessageDTO } from "@chatty/shared-types";
import { useLayoutEffect, useRef } from "react";
import { LOAD_OLDER_THRESHOLD_PX } from "../constants/pagination";

interface UseMessageScrollOptions {
	messages: MessageDTO[];
	hasMoreOlder: boolean;
	isLoadingOlder: boolean;
	onLoadOlder: () => void;
}

interface MessageScrollSnapshot {
	firstId: string | null;
	lastId: string | null;
	scrollHeight: number;
}

/**
 * Keeps the message list scrolled sensibly as its contents change, and asks for
 * older messages when the reader nears the top.
 *
 * Two situations look identical to React — the array grew — but need opposite
 * responses:
 *
 * - A **new message arrived** at the bottom: follow it, or an incoming message
 *   is appended out of sight.
 * - **Older messages were prepended**: do NOT move to the bottom. The browser
 *   keeps `scrollTop` unchanged while the content above grows, which shoves
 *   everything the reader was looking at downward. Adding the height difference
 *   back to `scrollTop` pins them to the same message.
 *
 * They are told apart by which end of the array changed: a different first id
 * with an unchanged last id means a prepend.
 */
export function useMessageScroll({ messages, hasMoreOlder, isLoadingOlder, onLoadOlder }: UseMessageScrollOptions) {
	const containerRef = useRef<HTMLDivElement>(null);
	const previousRef = useRef<MessageScrollSnapshot>({ firstId: null, lastId: null, scrollHeight: 0 });

	// useLayoutEffect, not useEffect: the correction has to happen before the
	// browser paints, otherwise the reader sees the list jump and snap back.
	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const firstId = messages[0]?.id ?? null;
		const lastId = messages[messages.length - 1]?.id ?? null;
		const previous = previousRef.current;

		const didPrependOlder = previous.firstId !== null && firstId !== previous.firstId && lastId === previous.lastId;

		if (didPrependOlder) {
			container.scrollTop += container.scrollHeight - previous.scrollHeight;
		} else if (lastId !== previous.lastId) {
			container.scrollTop = container.scrollHeight;
		}

		previousRef.current = { firstId, lastId, scrollHeight: container.scrollHeight };
	}, [messages]);

	function handleScroll() {
		const container = containerRef.current;
		if (!container || isLoadingOlder || !hasMoreOlder) return;

		if (container.scrollTop <= LOAD_OLDER_THRESHOLD_PX) onLoadOlder();
	}

	return { containerRef, handleScroll };
}
