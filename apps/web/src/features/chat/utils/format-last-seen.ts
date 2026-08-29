const MINUTE_MS = 60 * 1_000;
const HOUR_MS = 60 * MINUTE_MS;

export function formatLastSeen(lastSeenAt: string | null, now = new Date()): string | null {
	if (!lastSeenAt) return null;

	const date = new Date(lastSeenAt);
	const elapsedMs = Math.max(0, now.getTime() - date.getTime());
	if (elapsedMs < MINUTE_MS) return "Last seen just now";
	if (elapsedMs < HOUR_MS) return `Last seen ${Math.floor(elapsedMs / MINUTE_MS)}m ago`;
	if (date.toDateString() === now.toDateString()) return `Last seen ${Math.floor(elapsedMs / HOUR_MS)}h ago`;

	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
	if (date.toDateString() === yesterday.toDateString()) return `Last seen yesterday at ${time}`;

	const dateLabel = new Intl.DateTimeFormat(undefined, {
		day: "numeric",
		month: "short",
		...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
	}).format(date);

	return `Last seen ${dateLabel} at ${time}`;
}
