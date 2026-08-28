import type { Request, Response } from "express";
import {
	addParticipantSchema,
	createConversationSchema,
	markReadSchema,
	renameConversationSchema,
	transferOwnershipSchema,
} from "./conversations.schema.js";
import * as conversationsService from "./conversations.service.js";

// req.userId is always set here: requireAuth runs before these controllers (see conversations.routes.ts)

export async function createConversationController(req: Request, res: Response): Promise<void> {
	const input = createConversationSchema.parse(req.body);
	const conversation = await conversationsService.createConversation(req.userId!, input);
	res.status(201).json(conversation);
}

export async function listConversationsController(req: Request, res: Response): Promise<void> {
	const conversations = await conversationsService.listConversationsForUser(req.userId!);
	res.status(200).json(conversations);
}

export async function markReadController(req: Request, res: Response): Promise<void> {
	const input = markReadSchema.parse(req.body);
	const conversationId = req.params.conversationId as string;
	const event = await conversationsService.markConversationRead(req.userId!, conversationId, input);
	res.status(200).json(event);
}

export async function addParticipantController(req: Request, res: Response): Promise<void> {
	const input = addParticipantSchema.parse(req.body);
	const conversationId = req.params.conversationId as string;
	const conversation = await conversationsService.addParticipant(req.userId!, conversationId, input);
	res.status(201).json(conversation);
}

export async function removeParticipantController(req: Request, res: Response): Promise<void> {
	const conversationId = req.params.conversationId as string;
	const targetUserId = req.params.userId as string;
	await conversationsService.removeParticipant(req.userId!, conversationId, targetUserId);
	// No body: the actor and the target both learn what happened from socket
	// events, not from this response — see removeParticipant's doc comment.
	res.status(204).send();
}

export async function transferOwnershipController(req: Request, res: Response): Promise<void> {
	const input = transferOwnershipSchema.parse(req.body);
	const conversationId = req.params.conversationId as string;
	const conversation = await conversationsService.transferGroupOwnership(req.userId!, conversationId, input);
	res.status(200).json(conversation);
}

export async function renameConversationController(req: Request, res: Response): Promise<void> {
	const input = renameConversationSchema.parse(req.body);
	const conversationId = req.params.conversationId as string;
	const conversation = await conversationsService.renameConversation(req.userId!, conversationId, input);
	res.status(200).json(conversation);
}
