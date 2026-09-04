import type { RestrictionChangedEvent } from "@chatty/shared-types";
import { useCallback } from "react";
import { useRestrictedUsers } from "@/hooks/use-restricted-users";
import { useSocketEvent } from "./use-socket-event";

/**
 * Keeps one account's open sessions in agreement about who it has restricted.
 *
 * Mirrors `useBlockedUsersSync` exactly — see its comment for why a session
 * cache needs both a live event and a reconnect re-resolve.
 */
export function useRestrictedUsersSync(): () => Promise<void> {
	const apply = useRestrictedUsers((state) => state.apply);
	const refresh = useRestrictedUsers((state) => state.refresh);

	useSocketEvent(
		"restriction:changed",
		useCallback((event: RestrictionChangedEvent) => apply(event.userId, event.isRestricted), [apply]),
	);

	return refresh;
}
