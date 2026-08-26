import type { MessageDTO } from "@chatty/shared-types";
import { prisma } from "../../lib/prisma.js";
import { getIO } from "../../lib/socket-bus.js";
import { assertParticipant } from "../conversations/conversations.service.js";
import type { ListMessagesQuery, SendMessageInput } from "./messages.schema.js";

interface MessageRow {
	id: string;
	conversationId: string;
	authorId: string;
	content: string;
	createdAt: Date;
}

const messageSelect = {
	id: true,
	conversationId: true,
	authorId: true,
	content: true,
	createdAt: true,
} as const;

function toMessageDTO(row: MessageRow): MessageDTO {
	return {
		id: row.id,
		conversationId: row.conversationId,
		authorId: row.authorId,
		content: row.content,
		createdAt: row.createdAt.toISOString(),
	};
}

// `assertParticipant` is imported from the conversations service rather than
// defined here: participants belong to that module, and two copies of an
// authorization check are two chances for one of them to be relaxed alone.

export async function sendMessage(
	currentUserId: string,
	conversationId: string,
	input: SendMessageInput,
): Promise<MessageDTO> {
	await assertParticipant(currentUserId, conversationId);

	// One transaction: a conversation whose updatedAt disagrees with its newest
	// message sorts wrongly in the conversation list forever after.
	const [message] = await prisma.$transaction([
		prisma.message.create({
			data: { conversationId, authorId: currentUserId, content: input.content },
			select: messageSelect,
		}),
		prisma.conversation.update({
			where: { id: conversationId },
			data: { updatedAt: new Date() },
			select: { id: true },
		}),
	]);

	const messageDTO = toMessageDTO(message);

	// Broadcast to the room, which every participant's socket joined on connect.
	// The sender receives this too — their UI renders from the event, not from
	// this function's return value, so everyone runs the same code path.
	getIO().to(conversationId).emit("message:new", messageDTO);

	return messageDTO;
}

export async function listMessages(
	currentUserId: string,
	conversationId: string,
	query: ListMessagesQuery,
): Promise<MessageDTO[]> {
	await assertParticipant(currentUserId, conversationId);

	const messages = await prisma.message.findMany({
		where: { conversationId },
		// Newest first so `take` returns the most recent page; the client reverses
		// for display. Backed by @@index([conversationId, createdAt]).
		orderBy: { createdAt: "desc" },
		take: query.limit,
		// `before` is the id of the oldest message the client already has.
		// `skip: 1` excludes that message itself from the next page.
		...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
		select: messageSelect,
	});

	return messages.map(toMessageDTO);
}
