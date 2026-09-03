import type { BlockChangedEvent } from "@chatty/shared-types";
import { useCallback } from "react";
import { useBlockedUsers } from "@/hooks/use-blocked-users";
import { useSocketEvent } from "./use-socket-event";

/**
 * Keeps one account's open sessions in agreement about who it has blocked.
 *
 * The store caches a status for the whole session, which is right — it is one
 * request per person the user can act on — but blocking is exactly the setting
 * somebody changes on their phone with the laptop still open. Without this, that
 * laptop keeps offering "Block" for a person already blocked, or holds a
 * composer disabled after the block was lifted somewhere else.
 *
 * Returns the re-resolve rather than wiring it up here, because "the socket came
 * back" is `useSocketConnection`'s question and it is already asked once, beside
 * the other resyncs. The event covers a live change; the returned callback
 * covers a change made while this socket was down and the event went nowhere.
 */
export function useBlockedUsersSync(): () => Promise<void> {
	const apply = useBlockedUsers((state) => state.apply);
	const refresh = useBlockedUsers((state) => state.refresh);

	useSocketEvent(
		"block:changed",
		useCallback((event: BlockChangedEvent) => apply(event.userId, event.isBlocked), [apply]),
	);

	return refresh;
}
