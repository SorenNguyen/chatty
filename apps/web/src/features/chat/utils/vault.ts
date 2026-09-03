const MONTH_FORMATTER = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
const DATE_FORMATTER = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

export function formatVaultDate(isoTimestamp: string): string {
	return DATE_FORMATTER.format(new Date(isoTimestamp));
}

export function formatLinkSource(url: string): string {
	const parsed = new URL(url);

	return parsed.hostname || parsed.protocol.replace(":", "");
}

/**
 * Splits a loaded page into the months it was sent in, newest first.
 *
 * Generic over the row rather than written for attachments, because every list
 * in the vault answers "when was this shared?" and a month heading is the only
 * thing that turns a hundred rows into somewhere you can aim. The list arrives
 * already ordered newest-first, so insertion order *is* the order — which is why
 * this is a Map and not a sort.
 *
 * It groups what has been loaded, not what exists. A month heading can therefore
 * gain rows as the next page arrives, which is correct: the alternative is
 * asking the server to count every month before showing the first one.
 */
export function groupVaultByMonth<Item>(items: Item[], timestampOf: (item: Item) => string): [string, Item[]][] {
	const groups = new Map<string, Item[]>();
	for (const item of items) {
		const month = MONTH_FORMATTER.format(new Date(timestampOf(item)));
		groups.set(month, [...(groups.get(month) ?? []), item]);
	}

	return [...groups];
}
