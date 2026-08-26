import type { MessageDTO, ParticipantDTO } from "@chatty/shared-types";

export interface ReadReceipt {
	/** The newest message of yours that somebody else has read. */
	messageId: string;
	/** How many other participants have read it. Meaningful in a group; always 1 in a 1-1. */
	readerCount: number;
}

/**
 * Where to draw the "Seen" marker in a message list.
 *
 * Read markers point at *a* message, and reading is cumulative: a participant
 * whose marker sits on message 40 has read 1 through 40. So the question "has
 * anyone seen this?" becomes "is it at or before someone's marker", which is a
 * comparison of positions in the list — not of timestamps, and not of ids.
 *
 * Returns one receipt, on your newest seen message, rather than one per
 * message: a "Seen" under every line is noise, since everything above the last
 * one is seen too.
 *
 * Null when the answer is not knowable from what is loaded. A marker pointing at
 * a message from an older page is not found here, and guessing that it must
 * therefore be older would claim messages were read that may not have been.
 */
export function getReadReceipt(
	messages: MessageDTO[],
	participants: ParticipantDTO[],
	currentUserId: string,
): ReadReceipt | null {
	const others = participants.filter((participant) => participant.id !== currentUserId);

	const markerIndexes = others
		.map((participant) => messages.findIndex((message) => message.id === participant.lastReadMessageId))
		.filter((index) => index >= 0);

	if (markerIndexes.length === 0) return null;

	const furthestIndex = Math.max(...markerIndexes);

	// Walk back from the furthest thing anyone has read to the last message that
	// was actually yours — a receipt on somebody else's message says nothing.
	for (let index = furthestIndex; index >= 0; index -= 1) {
		const message = messages[index]!;

		if (message.authorId === currentUserId) {
			return {
				messageId: message.id,
				readerCount: markerIndexes.filter((markerIndex) => markerIndex >= index).length,
			};
		}
	}

	return null;
}
