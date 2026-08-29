import type { MessageDTO, MessageReplyDTO, ReactionDTO, ReactionKind } from "@chatty/shared-types";
import type { MessageKind, ReactionKind as PrismaReactionKind } from "@prisma/client";
import { buildAttachmentUrl } from "../../lib/attachment-storage.js";
import { toUserDTO, userSelect, type UserRow } from "../users/users.mapper.js";
import { MESSAGE_AUTHOR_ACTION_WINDOW_MS } from "./messages.constants.js";

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

interface ReactionRow {
	userId: string;
	kind: PrismaReactionKind;
}

/**
 * The parent of a reply, read shallowly.
 *
 * Deliberately not `MessageRow`: nesting the full select into itself would make
 * every message carry its parent's parent, and a thread five replies deep would
 * send the whole chain down the wire to render one quoted line. One level, and
 * only the columns the quote shows.
 */
interface ReplyParentRow {
	id: string;
	content: string;
	deletedAt: Date | null;
	author: { displayName: string } | null;
	attachment: { id: string } | null;
}

/**
 * The database spelling of a reaction, and the wire spelling.
 *
 * Two vocabularies on purpose, the same split `MessageKind` already makes: the
 * enum is SHOUTING_SNAKE because that is what Postgres enums look like, and the
 * DTO is kebab-case because that is what the rest of the client's types look
 * like. Mapping in one place is what stops `THUMBS_UP` leaking into a className.
 */
const REACTION_KIND_TO_DTO: Record<PrismaReactionKind, ReactionKind> = {
	HEART: "heart",
	THUMBS_UP: "thumbs-up",
	LAUGH: "laugh",
	FROWN: "frown",
	ANGRY: "angry",
};

export interface MessageRow {
	id: string;
	conversationId: string;
	kind: MessageKind;
	/** Null on a system message, which nobody wrote. */
	author: UserRow | null;
	content: string;
	createdAt: Date;
	editedAt: Date | null;
	deletedAt: Date | null;
	attachment: AttachmentRow | null;
	reactions: ReactionRow[];
	replyTo: ReplyParentRow | null;
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
	editedAt: true,
	deletedAt: true,
	attachment: { select: { id: true, width: true, height: true, byteSize: true } },
	// Oldest first, which is what makes the chip order stable: a kind holds the
	// position it was first used in rather than hopping about as counts change
	// under it. Grouping happens in `toReactionDTOs`, not in SQL — the rows are a
	// handful per message and a groupBy per message would be a second query.
	reactions: { select: { userId: true, kind: true }, orderBy: { createdAt: "asc" } },
	// One level deep. See `ReplyParentRow`.
	replyTo: {
		select: {
			id: true,
			content: true,
			deletedAt: true,
			author: { select: { displayName: true } },
			attachment: { select: { id: true } },
		},
	},
} as const;

/**
 * Rolls the reaction rows up into one entry per kind.
 *
 * A `Map` rather than an object literal because insertion order is the contract
 * here — the rows arrive oldest-first and the chips render in that order.
 */
function toReactionDTOs(rows: ReactionRow[]): ReactionDTO[] {
	const byKind = new Map<ReactionKind, string[]>();
	for (const row of rows) {
		const kind = REACTION_KIND_TO_DTO[row.kind];
		const userIds = byKind.get(kind);
		if (userIds) userIds.push(row.userId);
		else byKind.set(kind, [row.userId]);
	}

	return [...byKind].map(([kind, userIds]) => ({ kind, userIds }));
}

/**
 * Quotes the parent of a reply as it stands *now*.
 *
 * A deleted parent surrenders its text here rather than in the client: the
 * server already empties `content` on delete, and this makes the quote obey the
 * same rule even if a stale row ever slipped through.
 */
function toReplyDTO(row: ReplyParentRow): MessageReplyDTO {
	const isDeleted = row.deletedAt !== null;

	return {
		id: row.id,
		authorName: row.author?.displayName ?? null,
		content: isDeleted ? "" : row.content,
		hasAttachment: !isDeleted && row.attachment !== null,
		attachmentUrl: !isDeleted && row.attachment ? buildAttachmentUrl(row.attachment.id) : null,
		isDeleted,
	};
}

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
		authorActionExpiresAt:
			row.kind === "USER"
				? new Date(row.createdAt.getTime() + MESSAGE_AUTHOR_ACTION_WINDOW_MS).toISOString()
				: null,
		editedAt: row.editedAt?.toISOString() ?? null,
		deletedAt: row.deletedAt?.toISOString() ?? null,
		// A tombstone drops its reactions along with its text: they were left on
		// something that no longer says anything, and leaving three hearts under
		// "This message was deleted" reads as approval of the deletion.
		reactions: row.deletedAt ? [] : toReactionDTOs(row.reactions),
		replyTo: row.replyTo ? toReplyDTO(row.replyTo) : null,
	};
}
