import type { MessageDTO, MessageReplyDTO } from "@chatty/shared-types";

/**
 * The quote a draft carries while it is being sent.
 *
 * The server resolves this on every read and is the authority — see the
 * self-relation's note in ARCHITECTURE.md. This builds the same shape locally
 * for the seconds before the sent message comes back, so a reply does not lose
 * the line it is answering the moment it leaves the composer.
 */
export function toReplyQuote(parent: MessageDTO): MessageReplyDTO {
	return {
		id: parent.id,
		authorName: parent.author?.displayName ?? null,
		content: parent.content,
		// The first image only: a quote shows a thumbnail, not the gallery. Same
		// rule the server's own mapper follows.
		hasAttachment: parent.attachments.length > 0,
		attachmentUrl: parent.attachments[0]?.url ?? null,
		isDeleted: parent.deletedAt !== null,
	};
}
