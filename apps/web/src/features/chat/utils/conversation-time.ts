/**
 * The timestamp on a conversation row in the sidebar.
 *
 * Shorter the more recent it is, because that is the order the eye reads the
 * list in: minutes for the last hour, a clock time for today, then "Yest.", then
 * a weekday for the past week, then a date. A sidebar full of "23/08 09:41" is
 * six identical strings that all have to be parsed before one of them means
 * anything.
 *
 * Distinct from `formatMessageTime`, which sits inside a thread where the day is
 * already established by a rule above it and only the time is missing.
 */
export function formatConversationTime(isoTimestamp: string): string {
	const date = new Date(isoTimestamp);
	const now = new Date();
	const elapsedMinutes = Math.floor((now.getTime() - date.getTime()) / 60_000);

	if (elapsedMinutes < 1) return "now";
	if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

	if (date.toDateString() === now.toDateString()) {
		return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	}

	// Whole calendar days apart, not elapsed hours: an hour of daylight saving
	// would otherwise decide whether last night counts as yesterday.
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const startOfThatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const elapsedDays = Math.round((startOfToday.getTime() - startOfThatDay.getTime()) / 86_400_000);

	if (elapsedDays === 1) return "Yest.";
	if (elapsedDays < 7) return date.toLocaleDateString(undefined, { weekday: "short" });

	return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
