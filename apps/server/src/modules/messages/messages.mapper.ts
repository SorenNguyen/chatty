import type { MessageDTO } from "@chatty/shared-types";
import type { MessageKind } from "@prisma/client";
import { buildAttachmentUrl } from "../../lib/attachment-storage.js";
import { toUserDTO, userSelect, type UserRow } from "../users/users.mapper.js";

/**
 * How a message row becomes a `MessageDTO`, and which columns that needs.
 *
 * A fifth file in a module the conventions describe as four, for one reason:
 * `conversations.service` selects a `lastMessage` and has to produce the same
 * shape, and it cannot import this from `messages.service` because
 * `messages.service` already imports `assertParticipant` from
 * `conversations.service`. That cycle is not merely untidy — `conversationSelect`
 * is a module-level const built from `messageSelect`, so whichever of the two
 * loaded second would read it during the other's temporal dead zone and crash
 * on a startup ordering nobody chose.
 *
 * Splitting the mapper out breaks the cycle instead of hiding it: this file
 * imports neither service, so both can import it.
 *
 * Keeping one copy matters beyond the cycle. Two column lists for one DTO is how
 * a field ends up rendered on a message in the chat and missing on the very same
 * message in the sidebar.
 */

interface AttachmentRow {
	id: string;
	width: number;
	height: number;
	byteSize: number;
}

export interface MessageRow {
	id: string;
	conversationId: string;
	kind: MessageKind;
	/** Null on a system message, which nobody wrote. */
	author: UserRow | null;
	content: string;
	createdAt: Date;
	attachment: AttachmentRow | null;
}

export const messageSelect = {
	id: true,
	conversationId: true,
	kind: true,
	// The whole author, not their id. Resolving the id against the conversation's
	// participants — which is what the client used to do — loses the name and the
	// avatar of everyone who has since left the group, while their messages stay.
	// One join per page of messages is the price of history that keeps its faces.
	author: { select: userSelect },
	content: true,
	createdAt: true,
	attachment: { select: { id: true, width: true, height: true, byteSize: true } },
} as const;

export function toMessageDTO(row: MessageRow): MessageDTO {
	return {
		id: row.id,
		conversationId: row.conversationId,
		kind: row.kind === "SYSTEM" ? "system" : "user",
		author: row.author ? toUserDTO(row.author) : null,
		content: row.content,
		// The URL is built per response rather than stored: it carries a signed
		// token that expires, so a cached copy would rot.
		attachment: row.attachment
			? {
					id: row.attachment.id,
					url: buildAttachmentUrl(row.attachment.id),
					width: row.attachment.width,
					height: row.attachment.height,
					byteSize: row.attachment.byteSize,
				}
			: null,
		createdAt: row.createdAt.toISOString(),
	};
}
