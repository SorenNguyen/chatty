import type { Request, Response } from "express";
import { ValidationError } from "../../lib/errors.js";
import {
	editMessageSchema,
	listMessagesQuerySchema,
	messageContextQuerySchema,
	sendMessageSchema,
	toggleReactionSchema,
} from "./messages.schema.js";
import * as messagesService from "./messages.service.js";

// req.userId is always set here: requireAuth runs before these controllers (see messages.routes.ts)

export async function sendMessageController(req: Request, res: Response): Promise<void> {
	const input = sendMessageSchema.parse(req.body);
	const conversationId = req.params.conversationId as string;
	// Trimmed here, once, so the emptiness check and the stored value agree — a
	// caption of three spaces is not a caption.
	const content = input.content?.trim() ?? "";

	// The one rule that spans body and file, so it cannot live in either schema:
	// a message has to be something. Without it, posting `{}` stores a row with
	// no text and no image that renders as an empty bubble nobody can delete.
	if (!content && !req.file) {
		throw new ValidationError("A message needs text, an image, or both");
	}

	const message = await messagesService.sendMessage(req.userId!, conversationId, {
		content,
		...(input.replyToId ? { replyToId: input.replyToId } : {}),
		...(req.file ? { attachment: req.file.buffer } : {}),
	});
	res.status(201).json(message);
}

export async function editMessageController(req: Request, res: Response): Promise<void> {
	const input = editMessageSchema.parse(req.body);
	const conversationId = req.params.conversationId as string;
	const messageId = req.params.messageId as string;

	const message = await messagesService.editMessage(req.userId!, conversationId, messageId, input);
	res.status(200).json(message);
}

/**
 * Answers 200 with the tombstone rather than the 204 `removeParticipant` uses.
 *
 * The difference is that there is still a resource here: a deleted message keeps
 * its place in the conversation, and the caller's own view has to render it as
 * one. Nothing to describe is what earns a 204.
 */
export async function deleteMessageController(req: Request, res: Response): Promise<void> {
	const conversationId = req.params.conversationId as string;
	const messageId = req.params.messageId as string;

	const message = await messagesService.deleteMessage(req.userId!, conversationId, messageId);
	res.status(200).json(message);
}

export async function listMessagesController(req: Request, res: Response): Promise<void> {
	const query = listMessagesQuerySchema.parse(req.query);
	const conversationId = req.params.conversationId as string;
	const messages = await messagesService.listMessages(req.userId!, conversationId, query);
	res.status(200).json(messages);
}

export async function getMessageContextController(req: Request, res: Response): Promise<void> {
	const query = messageContextQuerySchema.parse(req.query);
	const context = await messagesService.getMessageContext(
		req.userId!,
		req.params.conversationId as string,
		req.params.messageId as string,
		query,
	);
	res.status(200).json(context);
}

export async function listMessageEditsController(req: Request, res: Response): Promise<void> {
	const edits = await messagesService.listMessageEdits(
		req.userId!,
		req.params.conversationId as string,
		req.params.messageId as string,
	);
	res.status(200).json(edits);
}

export async function hideMessageController(req: Request, res: Response): Promise<void> {
	await messagesService.hideMessageForUser(
		req.userId!,
		req.params.conversationId as string,
		req.params.messageId as string,
	);
	res.status(204).send();
}

/**
 * PUT rather than POST: the request states what the caller's reaction of this
 * kind should be, and sending it twice settles on the same place it started —
 * which is what a toggle is. 200 with the message, because the message is what
 * the caller renders.
 */
export async function toggleReactionController(req: Request, res: Response): Promise<void> {
	const input = toggleReactionSchema.parse(req.body);

	const message = await messagesService.toggleReaction(
		req.userId!,
		req.params.conversationId as string,
		req.params.messageId as string,
		input,
	);
	res.status(200).json(message);
}
