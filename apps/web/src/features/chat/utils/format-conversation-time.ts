/**
 * Formats the timestamp on a sidebar row.
 *
 * Deliberately not `formatMessageTime`. That one sits under a bubble where the
 * full date is welcome; this one sits in a narrow column next to a name that
 * has to keep its width, so it says the least that still locates the message:
 *
 * - under a minute  -> "now"
 * - today           -> "09:12"
 * - within the week -> "Mon"
 * - this year       -> "12 Aug"
 * - older           -> "08/24"
 *
 * The ladder is by elapsed time rather than by calendar bucket at the top end —
 * a message from 23:58 read at 00:02 is four minutes old, and calling it
 * "yesterday" is technically true and useless.
 */
export function formatConversationTime(isoTimestamp: string): string {
	const timestamp = new Date(isoTimestamp);
	const now = new Date();
	const elapsedMs = now.getTime() - timestamp.getTime();

	const oneMinuteMs = 60_000;
	if (elapsedMs < oneMinuteMs) return "now";

	if (timestamp.toDateString() === now.toDateString()) {
		return timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	}

	const oneWeekMs = 7 * 24 * 60 * oneMinuteMs;
	if (elapsedMs < oneWeekMs) return timestamp.toLocaleDateString([], { weekday: "short" });

	if (timestamp.getFullYear() === now.getFullYear()) {
		return timestamp.toLocaleDateString([], { day: "numeric", month: "short" });
	}

	return timestamp.toLocaleDateString([], { year: "2-digit", month: "2-digit" });
}
