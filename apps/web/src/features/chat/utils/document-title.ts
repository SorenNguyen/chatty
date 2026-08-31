/** The title with nothing waiting. Must match the one in index.html. */
const BASE_TITLE = "Chatty";

/**
 * Caps what the title will print. Past this the exact number stops being
 * information — "you have a lot" is the whole message — and a four-digit count
 * pushes the app's name out of a narrow tab.
 */
const MAX_TITLE_COUNT = 99;

/**
 * The tab title for a given number of unread messages.
 *
 * The count goes in front, because a tab strip truncates from the right: a
 * title that reads "Chatty (3)" loses the only part worth showing the moment
 * more than three tabs are open.
 */
export function buildDocumentTitle(unreadCount: number): string {
	if (unreadCount <= 0) return BASE_TITLE;

	return `(${unreadCount > MAX_TITLE_COUNT ? `${MAX_TITLE_COUNT}+` : String(unreadCount)}) ${BASE_TITLE}`;
}
