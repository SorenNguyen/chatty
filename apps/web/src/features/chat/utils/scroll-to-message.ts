/**
 * Scrolls a message to the middle of the thread, if it is on screen.
 *
 * Returns whether it found one, because that is the half worth knowing. A
 * message that is not rendered is not necessarily missing: `MAX_RETAINED_MESSAGES`
 * drops old pages, and a search result or a reply can point at something further
 * back than the thread currently holds. So a miss means "fetch the page around
 * it first", not "no such message", and both callers that ask branch on exactly
 * that.
 *
 * Lifted here because the same `getElementById(\`message-…\`)` lookup was written
 * three times — the page, the list and the rows — and two of them also had to
 * remember `block: "center"`. Three copies of a selector built from a template
 * string is three chances for one of them to disagree with the `id` the row
 * actually renders.
 */
export function scrollToMessage(messageId: string, behavior: ScrollBehavior = "smooth"): boolean {
	const element = document.getElementById(`message-${messageId}`);
	if (!element) return false;

	element.scrollIntoView({ block: "center", behavior });

	return true;
}
