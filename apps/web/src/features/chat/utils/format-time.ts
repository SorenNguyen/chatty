/**
 * Formats a message timestamp for display next to a bubble.
 *
 * Time only. It used to prepend the date for anything older than today, because
 * scrolling back through a wall of bare times told you nothing about which day
 * you were in — that job now belongs to the day rule the list draws between one
 * calendar day and the next (`formatDayLabel`), which states it once instead of
 * on every line. Keeping both would print the date twice on the same row.
 */
export function formatMessageTime(isoTimestamp: string): string {
	return new Date(isoTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
