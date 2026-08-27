import { randomUUID } from "node:crypto";
import type { MessageDTO } from "@chatty/shared-types";
import type { Prisma } from "@prisma/client";
import { deleteAttachment, saveAttachment } from "../../lib/attachment-storage.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { getIO } from "../../lib/socket-bus.js";
import { assertParticipant } from "../conversations/conversations.service.js";
import { messageSelect, toMessageDTO } from "./messages.mapper.js";
import type { EditMessageInput, ListMessagesQuery } from "./messages.schema.js";

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

/**
 * What survives the authorization check: the two facts either operation still
 * has to branch on. Everything else the check consumed — kind, author — has
 * already done its job by the time this is returned.
 */
interface EditableMessage {
	deletedAt: Date | null;
	attachmentId: string | null;
}

/**
 * Loads a message the caller is allowed to change, with the conversation locked.
 *
 * The lock is the same one `sendMessage` and every group mutation take, for the
 * same reason: it puts a change to a message and a change to who is in the
 * conversation into one honest order. Without it, someone removed from a group
 * could pass the membership check a moment before the removal commits.
 *
 * Called inside the caller's transaction rather than opening its own, so the
 * lock is still held when the write happens — taking it and letting go before
 * the update would order nothing.
 */
async function loadEditableMessage(
	transaction: Prisma.TransactionClient,
	currentUserId: string,
	conversationId: string,
	messageId: string,
): Promise<EditableMessage> {
	await transaction.$queryRaw`
		SELECT id
		FROM "Conversation"
		WHERE id = ${conversationId}
		FOR UPDATE
	`;

	await assertParticipant(currentUserId, conversationId, transaction);

	const message = await transaction.message.findUnique({
		where: { id: messageId },
		select: {
			conversationId: true,
			kind: true,
			authorId: true,
			deletedAt: true,
			attachment: { select: { id: true } },
		},
	});

	// One error for "no such message" and for "a message in a conversation you
	// are in, but not this one", so neither can be used to probe for ids — the
	// same reasoning `markConversationRead` already uses.
	if (!message || message.conversationId !== conversationId) throw new NotFoundError("Message not found");

	// Nobody wrote a system line, so there is nobody who may rewrite it. The
	// database refuses this too (see the phase 8 migration); this is the check
	// that produces a 403 instead of a 500.
	if (message.kind === "SYSTEM") throw new ForbiddenError("A system message cannot be edited or deleted");

	// ForbiddenError, not NotFoundError: the caller is already known to be in this
	// conversation and can see the message perfectly well, so hiding behind a 404
	// would only leave the UI unable to say why nothing happened.
	if (message.authorId !== currentUserId) throw new ForbiddenError("Only the author can change a message");

	return { deletedAt: message.deletedAt, attachmentId: message.attachment?.id ?? null };
}

/**
 * Replaces the text of a message the caller wrote.
 *
 * Deliberately leaves `Conversation.updatedAt` alone, unlike `sendMessage`:
 * fixing a typo in something sent last week is not new activity, and bumping it
 * would throw the thread to the top of everyone's sidebar with nothing new in
 * it. The sidebar *preview* still changes, because it reads the newest message
 * rather than a stored copy.
 */
export async function editMessage(
	currentUserId: string,
	conversationId: string,
	messageId: string,
	input: EditMessageInput,
): Promise<MessageDTO> {
	// Trimmed once, so the emptiness check and the stored value agree — the same
	// rule `sendMessageController` applies on the way in.
	const content = input.content.trim();

	const updated = await prisma.$transaction(async (transaction) => {
		const message = await loadEditableMessage(transaction, currentUserId, conversationId, messageId);

		// Editing a tombstone would have to un-delete it, and "deleted" is the one
		// state everyone else has already been told about.
		if (message.deletedAt) throw new ValidationError("This message was deleted");

		// The send rule, restated where it still applies: a message has to be
		// something. Clearing the caption of a picture is fine; clearing the whole
		// of a text message leaves an empty bubble that only delete should produce.
		if (!content && !message.attachmentId) {
			throw new ValidationError("A message needs text, an image, or both");
		}

		return transaction.message.update({
			where: { id: messageId },
			data: { content, editedAt: new Date() },
			select: messageSelect,
		});
	});

	const messageDTO = toMessageDTO(updated);

	getIO().to(conversationId).emit("message:updated", messageDTO);

	return messageDTO;
}

/**
 * Deletes a message the caller wrote, leaving a tombstone in its place.
 *
 * Idempotent: deleting an already-deleted message returns it unchanged and
 * broadcasts nothing. Two tabs pressing the button is the ordinary case, not an
 * error worth reporting.
 */
export async function deleteMessage(
	currentUserId: string,
	conversationId: string,
	messageId: string,
): Promise<MessageDTO> {
	const { deleted, removedAttachmentId, wasAlreadyDeleted } = await prisma.$transaction(async (transaction) => {
		const message = await loadEditableMessage(transaction, currentUserId, conversationId, messageId);

		if (message.deletedAt) {
			const unchanged = await transaction.message.findUniqueOrThrow({
				where: { id: messageId },
				select: messageSelect,
			});

			return { deleted: unchanged, removedAttachmentId: null, wasAlreadyDeleted: true };
		}

		// The attachment row goes with the text. Leaving it would keep serving the
		// picture — the image is the part of an image message worth deleting.
		if (message.attachmentId) {
			await transaction.attachment.delete({ where: { id: message.attachmentId } });
		}

		const updated = await transaction.message.update({
			where: { id: messageId },
			// Emptied, not hidden: a client that forgets to check `deletedAt` then
			// renders nothing rather than the message. The check constraint added
			// with this feature is what keeps that true of every future write.
			data: { content: "", deletedAt: new Date() },
			select: messageSelect,
		});

		return { deleted: updated, removedAttachmentId: message.attachmentId, wasAlreadyDeleted: false };
	});

	// After the commit, and on purpose. The other order — file first — leaves a
	// message pointing at a picture that is gone if the transaction then rolls
	// back, which is the broken-image case `sendMessage` also refuses to risk.
	// A crash here instead leaves an unreferenced file, which costs bytes.
	if (removedAttachmentId) {
		await deleteAttachment(removedAttachmentId).catch((error: unknown) => {
			// Not rethrown: the message *is* deleted, and failing the request now
			// would tell the caller otherwise. The file is the recoverable half.
			logger.error({ err: error, attachmentId: removedAttachmentId }, "failed to remove attachment file");
		});
	}

	const messageDTO = toMessageDTO(deleted);

	// Nothing to announce when it was already a tombstone: everyone was told the
	// first time, and a second event would only re-render what is already there.
	if (!wasAlreadyDeleted) getIO().to(conversationId).emit("message:updated", messageDTO);

	return messageDTO;
}
