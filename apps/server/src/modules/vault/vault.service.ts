import type {
	AttachmentPageDTO,
	MessageLinkPageDTO,
	MessageSearchResultDTO,
	SavedMessagePageDTO,
} from "@chatty/shared-types";
import { Prisma } from "@prisma/client";
import { buildAttachmentUrl } from "../../lib/attachment-storage.js";
import { NotFoundError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { assertParticipant } from "../conversations/conversations.service.js";
import { messageSelect, toMessageDTO } from "../messages/messages.mapper.js";
import { toUserDTO, userSelect } from "../users/users.mapper.js";
import type { ListLinksQuery, ListMediaQuery, ListSavedQuery } from "./vault.schema.js";

const KIND_TO_COLUMN = { image: "IMAGE", file: "FILE", audio: "AUDIO" } as const;

export async function listConversationMedia(
	userId: string,
	conversationId: string,
	query: ListMediaQuery,
): Promise<AttachmentPageDTO> {
	await assertParticipant(userId, conversationId);
	const before = query.before
		? await prisma.attachment.findFirst({
				where: {
					id: query.before,
					conversationId,
					message: { hiddenFor: { none: { userId } } },
				},
				select: { createdAt: true, id: true },
			})
		: null;
	if (query.before && !before) throw new NotFoundError("Attachment not found");

	const ids = await prisma.$queryRaw<{ id: string }[]>`
		SELECT attachment.id
		FROM "Attachment" attachment
		WHERE attachment."conversationId" = ${conversationId}
			AND attachment.kind = ${KIND_TO_COLUMN[query.kind]}::"AttachmentKind"
			AND NOT EXISTS (
				SELECT 1 FROM "MessageHiddenFor" hidden
				WHERE hidden."messageId" = attachment."messageId" AND hidden."userId" = ${userId}
			)
			${before ? Prisma.sql`AND (attachment."createdAt", attachment.id) < (${before.createdAt}, ${before.id})` : Prisma.empty}
		ORDER BY attachment."createdAt" DESC, attachment.id DESC
		LIMIT ${query.limit + 1}
	`;
	const hasMore = ids.length > query.limit;
	const pageIds = ids.slice(0, query.limit).map((row) => row.id);
	if (pageIds.length === 0) return { items: [], hasMore: false };

	const rows = await prisma.attachment.findMany({
		where: { id: { in: pageIds } },
		select: {
			id: true,
			kind: true,
			mediaType: true,
			fileName: true,
			width: true,
			height: true,
			byteSize: true,
			durationMs: true,
			waveform: true,
			hasThumbnail: true,
			message: { select: { id: true, createdAt: true, author: { select: { displayName: true } } } },
		},
	});
	const byId = new Map(rows.map((row) => [row.id, row]));
	const items = pageIds.flatMap((id) => {
		const row = byId.get(id);
		if (!row) return [];

		return [
			{
				id: row.id,
				kind:
					row.kind === "IMAGE"
						? ("image" as const)
						: row.kind === "FILE"
							? ("file" as const)
							: ("audio" as const),
				url: buildAttachmentUrl(row.id),
				thumbUrl: row.kind === "IMAGE" && row.hasThumbnail ? buildAttachmentUrl(row.id, "thumb") : null,
				width: row.width,
				height: row.height,
				byteSize: row.byteSize,
				fileName: row.fileName,
				mediaType: row.mediaType,
				durationMs: row.durationMs,
				waveform: row.waveform,
				messageId: row.message.id,
				messageCreatedAt: row.message.createdAt.toISOString(),
				authorName: row.message.author?.displayName ?? null,
			},
		];
	});

	return { items, hasMore };
}

export async function listConversationLinks(
	userId: string,
	conversationId: string,
	query: ListLinksQuery,
): Promise<MessageLinkPageDTO> {
	await assertParticipant(userId, conversationId);
	if (query.before) {
		const cursor = await prisma.messageLink.findFirst({
			where: {
				id: query.before,
				conversationId,
				message: { hiddenFor: { none: { userId } }, deletedAt: null },
			},
			select: { id: true },
		});
		if (!cursor) throw new NotFoundError("Link not found");
	}
	const links = await prisma.messageLink.findMany({
		where: {
			conversationId,
			message: { hiddenFor: { none: { userId } }, deletedAt: null },
		},
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		take: query.limit + 1,
		...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
		select: {
			id: true,
			messageId: true,
			url: true,
			createdAt: true,
			message: { select: { author: { select: { displayName: true } } } },
		},
	});

	return {
		items: links.slice(0, query.limit).map((link) => ({
			id: link.id,
			messageId: link.messageId,
			url: link.url,
			createdAt: link.createdAt.toISOString(),
			authorName: link.message.author?.displayName ?? null,
		})),
		hasMore: links.length > query.limit,
	};
}

export async function listSavedMessages(userId: string, query: ListSavedQuery): Promise<SavedMessagePageDTO> {
	if (query.before) {
		const cursor = await prisma.messageStar.findFirst({
			where: {
				messageId: query.before,
				userId,
				message: {
					deletedAt: null,
					hiddenFor: { none: { userId } },
					conversation: { participants: { some: { userId } } },
				},
			},
			select: { messageId: true },
		});
		if (!cursor) throw new NotFoundError("Saved message not found");
	}
	const stars = await prisma.messageStar.findMany({
		where: {
			userId,
			message: {
				deletedAt: null,
				hiddenFor: { none: { userId } },
				conversation: { participants: { some: { userId } } },
			},
		},
		orderBy: [{ createdAt: "desc" }, { messageId: "desc" }],
		take: query.limit + 1,
		...(query.before ? { cursor: { messageId_userId: { messageId: query.before, userId } }, skip: 1 } : {}),
		select: {
			message: {
				select: {
					...messageSelect,
					conversation: {
						select: {
							id: true,
							isGroup: true,
							name: true,
							participants: { select: { user: { select: userSelect } } },
						},
					},
				},
			},
		},
	});
	const results: MessageSearchResultDTO[] = stars.slice(0, query.limit).map(({ message }) => ({
		message: toMessageDTO(message),
		conversation: {
			id: message.conversation.id,
			isGroup: message.conversation.isGroup,
			name: message.conversation.name,
			participants: message.conversation.participants.map((participant) => toUserDTO(participant.user)),
		},
	}));

	return { results, hasMore: stars.length > query.limit };
}
