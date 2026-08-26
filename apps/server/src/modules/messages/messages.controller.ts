import type { Request, Response } from "express";
import { listMessagesQuerySchema, sendMessageSchema } from "./messages.schema.js";
import * as messagesService from "./messages.service.js";

// req.userId is always set here: requireAuth runs before these controllers (see messages.routes.ts)

export async function sendMessageController(req: Request, res: Response): Promise<void> {
	const input = sendMessageSchema.parse(req.body);
	const conversationId = req.params.conversationId as string;
	const message = await messagesService.sendMessage(req.userId!, conversationId, input);
	res.status(201).json(message);
}

export async function listMessagesController(req: Request, res: Response): Promise<void> {
	const query = listMessagesQuerySchema.parse(req.query);
	const conversationId = req.params.conversationId as string;
	const messages = await messagesService.listMessages(req.userId!, conversationId, query);
	res.status(200).json(messages);
}
