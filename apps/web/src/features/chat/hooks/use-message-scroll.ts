import type { MessageDTO } from "@chatty/shared-types";
import { useLayoutEffect, useRef, useState } from "react";
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
	/** Distinguishes a prepend from a trim: both change `firstId` and keep `lastId`. */
	length: number;
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
 *
 * A third case looks exactly like the second and needs the opposite of it. When
 * the list trims its oldest page (see `MAX_RETAINED_MESSAGES`) the first id also
 * changes with the last id unchanged, but the content above *shrank* — so the
 * correction would be negative and would throw the reader to the top of a thread
 * they were sitting at the bottom of. The length is what tells the two apart,
 * which is the only reason the snapshot carries one.
 */
export function useMessageScroll({ messages, hasMoreOlder, isLoadingOlder, onLoadOlder }: UseMessageScrollOptions) {
	const containerRef = useRef<HTMLDivElement>(null);
	const previousRef = useRef<MessageScrollSnapshot>({ firstId: null, lastId: null, scrollHeight: 0, length: 0 });
	const shouldFollowLatestRef = useRef(true);
	const [isFarFromBottom, setIsFarFromBottom] = useState(false);

	// useLayoutEffect, not useEffect: the correction has to happen before the
	// browser paints, otherwise the reader sees the list jump and snap back.
	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const firstId = messages[0]?.id ?? null;
		const lastId = messages[messages.length - 1]?.id ?? null;
		const previous = previousRef.current;

		const didStartChange = previous.firstId !== null && firstId !== previous.firstId;
		const didPrependOlder = didStartChange && lastId === previous.lastId && messages.length > previous.length;
		const didDropOldest = didStartChange && lastId === previous.lastId && messages.length < previous.length;

		if (didPrependOlder) {
			container.scrollTop += container.scrollHeight - previous.scrollHeight;
		} else if (
			(didDropOldest || lastId !== previous.lastId) &&
			(previous.lastId === null || shouldFollowLatestRef.current)
		) {
			container.scrollTop = container.scrollHeight;
		}

		previousRef.current = { firstId, lastId, scrollHeight: container.scrollHeight, length: messages.length };
	}, [messages]);

	function handleScroll() {
		const container = containerRef.current;
		if (!container) return;
		const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
		shouldFollowLatestRef.current = distanceFromBottom < 120;
		setIsFarFromBottom(distanceFromBottom > container.clientHeight);

		if (!isLoadingOlder && hasMoreOlder && container.scrollTop <= LOAD_OLDER_THRESHOLD_PX) onLoadOlder();
	}

	function scrollToLatest(): void {
		const container = containerRef.current;
		if (!container) return;
		shouldFollowLatestRef.current = true;
		container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
		setIsFarFromBottom(false);
	}

	// The ref itself rather than its value: the trim decision is made in an effect
	// that must not re-run because the reader scrolled, and a boolean in the
	// return would make every scroll event a render.
	return { containerRef, handleScroll, isFarFromBottom, scrollToLatest, isPinnedToLatestRef: shouldFollowLatestRef };
}
