import { randomUUID } from "node:crypto";
import type { MessageDTO } from "@chatty/shared-types";
import { saveAttachment } from "../../lib/attachment-storage.js";
import { prisma } from "../../lib/prisma.js";
import { getIO } from "../../lib/socket-bus.js";
import { assertParticipant } from "../conversations/conversations.service.js";
import { messageSelect, toMessageDTO } from "./messages.mapper.js";
import type { ListMessagesQuery } from "./messages.schema.js";

/**
 * What `sendMessage` takes. Not the Zod type: the image arrives as `req.file`
 * rather than in the body, so it never passes through a body schema.
 */
export interface SendMessageArgs {
	/** Empty string for a message that is only an image. */
	content: string;
	attachment?: Buffer | undefined;
}

export async function sendMessage(
	currentUserId: string,
	conversationId: string,
	input: SendMessageArgs,
): Promise<MessageDTO> {
	// Fail before decoding/writing an attachment for the ordinary unauthorized
	// case. This is only a cheap guard; the check inside the locked transaction
	// below is the authority when membership changes concurrently.
	await assertParticipant(currentUserId, conversationId);

	// The id is generated here, not by the database, so the file can be written
	// before the row that points at it exists. A crash between the two leaves an
	// unreferenced file, which costs bytes; the other order leaves a message
	// showing a broken image forever. Same trade avatar upload makes.
	const attachmentId = input.attachment ? randomUUID() : null;
	const stored = input.attachment && attachmentId ? await saveAttachment(attachmentId, input.attachment) : null;

	const message = await prisma.$transaction(async (transaction) => {
		// Membership changes take the same conversation lock. Re-checking after it
		// means a send racing with a kick has one honest order: it either commits
		// before the removal, or observes the removal and is refused afterwards.
		await transaction.$queryRaw`
			SELECT id
			FROM "Conversation"
			WHERE id = ${conversationId}
			FOR UPDATE
		`;

		await assertParticipant(currentUserId, conversationId, transaction);

		const created = await transaction.message.create({
			data: {
				conversationId,
				authorId: currentUserId,
				content: input.content,
				...(stored && attachmentId ? { attachment: { create: { id: attachmentId, ...stored } } } : {}),
			},
			select: messageSelect,
		});

		// A conversation whose updatedAt disagrees with its newest message sorts
		// wrongly in the conversation list forever after.
		await transaction.conversation.update({
			where: { id: conversationId },
			data: { updatedAt: new Date() },
			select: { id: true },
		});

		return created;
	});

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
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		take: query.limit,
		// `before` is the id of the oldest message the client already has.
		// `skip: 1` excludes that message itself from the next page.
		...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
		select: messageSelect,
	});

	return messages.map(toMessageDTO);
}
