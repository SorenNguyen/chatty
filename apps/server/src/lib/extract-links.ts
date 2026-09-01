const MAX_LINKS_PER_MESSAGE = 10;
const LINK_PATTERN = /(?:https?:\/\/|mailto:|www\.|(?<![@\w])(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,})([^\s<>]*)/giu;
const TRAILING_PUNCTUATION = /[.,!?;:'"\]}]+$/u;

/** Extracts bounded, normalized URLs without ever opening them. */
export function extractLinks(content: string): string[] {
	const links: string[] = [];
	const seen = new Set<string>();
	for (const match of content.matchAll(LINK_PATTERN)) {
		let url = match[0].replace(TRAILING_PUNCTUATION, "");
		while (url.endsWith(")") && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
			url = url.slice(0, -1);
		}
		if (!/^(?:https?:\/\/|mailto:)/iu.test(url)) url = `https://${url}`;
		if (seen.has(url)) continue;
		seen.add(url);
		links.push(url);
		if (links.length === MAX_LINKS_PER_MESSAGE) break;
	}

	return links;
}
