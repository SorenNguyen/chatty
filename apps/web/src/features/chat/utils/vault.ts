import type { AttachmentWithMessageDTO } from "@chatty/shared-types";

const MONTH_FORMATTER = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
const DATE_FORMATTER = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

export function formatVaultDate(isoTimestamp: string): string {
	return DATE_FORMATTER.format(new Date(isoTimestamp));
}

export function formatLinkSource(url: string): string {
	const parsed = new URL(url);

	return parsed.hostname || parsed.protocol.replace(":", "");
}

export function groupVaultMedia(attachments: AttachmentWithMessageDTO[]): [string, AttachmentWithMessageDTO[]][] {
	const groups = new Map<string, AttachmentWithMessageDTO[]>();
	for (const attachment of attachments) {
		const month = MONTH_FORMATTER.format(new Date(attachment.messageCreatedAt));
		groups.set(month, [...(groups.get(month) ?? []), attachment]);
	}

	return [...groups];
}
