export function formatLastSeen(lastSeenAt: string | null): string | null {
	if (!lastSeenAt) return null;

	const date = new Date(lastSeenAt);
	const today = new Date();
	const isToday = date.toDateString() === today.toDateString();
	const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);

	return isToday ? `Last seen today at ${time}` : `Last seen ${date.toLocaleDateString()} at ${time}`;
}
