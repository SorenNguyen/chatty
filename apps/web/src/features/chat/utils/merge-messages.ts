import type { MessageDTO } from "@chatty/shared-types";

/**
 * Folds a freshly fetched newest page into the messages already on screen.
 *
 * Used after a reconnect. A socket that was down missed two different things,
 * and only one of them is a new message: an edit, a delete or a reaction that
 * landed while the connection was gone changed a message that is still on
 * screen, and no amount of appending will fix that. So the reloaded page wins
 * for every id it carries, and anything it does not carry is kept.
 *
 * The gap case is the reason this is not a plain merge. If the disconnection
 * outlasted a whole page of messages, the newest page and the loaded history no
 * longer touch, and stitching them together would render a thread with a hole
 * in it and no sign that anything is missing. When nothing overlaps, the fresh
 * page replaces the lot — the same state as opening the conversation now, which
 * is honest, and paging back up is how the rest is reached.
 */
export function mergeReloadedMessages(current: MessageDTO[], reloaded: MessageDTO[]): MessageDTO[] {
	if (current.length === 0) return reloaded;
	if (reloaded.length === 0) return current;

	const reloadedById = new Map(reloaded.map((message) => [message.id, message]));
	const overlaps = current.some((message) => reloadedById.has(message.id));

	if (!overlaps) return reloaded;

	const kept = current.map((message) => reloadedById.get(message.id) ?? message);
	const knownIds = new Set(current.map((message) => message.id));
	const added = reloaded.filter((message) => !knownIds.has(message.id));

	return [...kept, ...added];
}
