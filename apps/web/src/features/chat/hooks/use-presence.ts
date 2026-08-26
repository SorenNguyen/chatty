import type { PresenceEvent, PresenceSnapshotEvent } from "@chatty/shared-types";
import { useCallback, useState } from "react";
import { useSocketEvent } from "./use-socket-event";

/**
 * The set of users currently online, among people the viewer shares a
 * conversation with.
 *
 * Fed by two events, and it needs both. `presence:update` only reports
 * *changes*, so on its own everyone who was already online before this tab
 * opened would look offline until they happened to reconnect. The server sends
 * `presence:snapshot` right after the handshake to fill that in — including
 * after a dropped connection is re-established, which is when a client is most
 * likely to have missed updates.
 */
export function usePresence(): Set<string> {
	const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());

	useSocketEvent(
		"presence:snapshot",
		useCallback((event: PresenceSnapshotEvent) => {
			// Replaces rather than merges. The snapshot is the whole truth as of the
			// handshake, so anything held from before a reconnect is stale by
			// definition and merging would keep a departed user lit.
			setOnlineUserIds(new Set(event.onlineUserIds));
		}, []),
	);

	useSocketEvent(
		"presence:update",
		useCallback((event: PresenceEvent) => {
			setOnlineUserIds((current) => {
				const next = new Set(current);
				if (event.isOnline) next.add(event.userId);
				else next.delete(event.userId);

				return next;
			});
		}, []),
	);

	return onlineUserIds;
}
