import type { ConversationDTO, PresenceEvent } from "@chatty/shared-types";
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useSocketEvent } from "./use-socket-event";

export function usePresenceLastSeenSync(setConversations: Dispatch<SetStateAction<ConversationDTO[]>>): void {
	useSocketEvent(
		"presence:update",
		useCallback(
			(event: PresenceEvent) => {
				// `null` is meaningful: a privacy change (including a direct block)
				// withdraws a timestamp already rendered on another open device.
				if (event.isOnline) return;
				setConversations((current) =>
					current.map((conversation) => ({
						...conversation,
						participants: conversation.participants.map((participant) =>
							participant.id === event.userId
								? { ...participant, lastSeenAt: event.lastSeenAt }
								: participant,
						),
					})),
				);
			},
			[setConversations],
		),
	);
}
