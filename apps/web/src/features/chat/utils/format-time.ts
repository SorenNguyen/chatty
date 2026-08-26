/**
 * Formats a message timestamp for display next to a bubble.
 *
 * Same day -> "14:05"; anything older also carries the date, so scrolling back
 * through history does not show a wall of times with no idea which day they are.
 */
export function formatMessageTime(isoTimestamp: string): string {
	const timestamp = new Date(isoTimestamp);
	const isToday = timestamp.toDateString() === new Date().toDateString();

	const time = timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	if (isToday) return time;

	return `${timestamp.toLocaleDateString([], { day: "2-digit", month: "2-digit" })} ${time}`;
}
