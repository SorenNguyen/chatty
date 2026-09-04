import type { Request, Response } from "express";
import {
	addParticipantSchema,
	archiveConversationSchema,
	createConversationSchema,
	listConversationsQuerySchema,
	markReadSchema,
	muteConversationSchema,
	pinConversationSchema,
	renameConversationSchema,
	setInvitePolicySchema,
	setParticipantRoleSchema,
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
	const query = listConversationsQuerySchema.parse(req.query);
	const page = await conversationsService.listConversationsForUser(req.userId!, {
		isArchived: query.archived,
		...(query.limit === undefined ? {} : { limit: query.limit }),
		...(query.before === undefined ? {} : { before: query.before }),
	});
	res.status(200).json(page);
}

export async function getConversationController(req: Request, res: Response): Promise<void> {
	const conversationId = req.params.conversationId as string;
	res.status(200).json(await conversationsService.getConversationForUser(req.userId!, conversationId));
}

export async function archiveConversationController(req: Request, res: Response): Promise<void> {
	const input = archiveConversationSchema.parse(req.body);
	const state = await conversationsService.setConversationArchived(
		req.userId!,
		req.params.conversationId as string,
		input,
	);
	res.status(200).json(state);
}

export async function pinConversationController(req: Request, res: Response): Promise<void> {
	const input = pinConversationSchema.parse(req.body);
	const state = await conversationsService.setConversationPinned(
		req.userId!,
		req.params.conversationId as string,
		input,
	);
	res.status(200).json(state);
}

export async function muteConversationController(req: Request, res: Response): Promise<void> {
	const input = muteConversationSchema.parse(req.body);
	const state = await conversationsService.setConversationMuted(
		req.userId!,
		req.params.conversationId as string,
		input,
	);
	res.status(200).json(state);
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

export async function setParticipantRoleController(req: Request, res: Response): Promise<void> {
	const input = setParticipantRoleSchema.parse(req.body);
	const conversation = await conversationsService.setParticipantRole(
		req.userId!,
		req.params.conversationId as string,
		req.params.userId as string,
		input,
	);
	res.status(200).json(conversation);
}

export async function setInvitePolicyController(req: Request, res: Response): Promise<void> {
	const input = setInvitePolicySchema.parse(req.body);
	const conversation = await conversationsService.setGroupInvitePolicy(
		req.userId!,
		req.params.conversationId as string,
		input,
	);
	res.status(200).json(conversation);
}

export async function renameConversationController(req: Request, res: Response): Promise<void> {
	const input = renameConversationSchema.parse(req.body);
	const conversationId = req.params.conversationId as string;
	const conversation = await conversationsService.renameConversation(req.userId!, conversationId, input);
	res.status(200).json(conversation);
}
