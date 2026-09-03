import type { Request, Response } from "express";
import { listLinksSchema, listMediaSchema, listSavedSchema } from "./vault.schema.js";
import * as vaultService from "./vault.service.js";

export async function listConversationMediaController(req: Request, res: Response): Promise<void> {
	const query = listMediaSchema.parse(req.query);
	const page = await vaultService.listConversationMedia(req.userId!, req.params.conversationId as string, query);
	res.status(200).json(page);
}

export async function listConversationLinksController(req: Request, res: Response): Promise<void> {
	const query = listLinksSchema.parse(req.query);
	const page = await vaultService.listConversationLinks(req.userId!, req.params.conversationId as string, query);
	res.status(200).json(page);
}

export async function getConversationVaultSummaryController(req: Request, res: Response): Promise<void> {
	const summary = await vaultService.getConversationVaultSummary(req.userId!, req.params.conversationId as string);
	res.status(200).json(summary);
}

export async function listSavedMessagesController(req: Request, res: Response): Promise<void> {
	const query = listSavedSchema.parse(req.query);
	const page = await vaultService.listSavedMessages(req.userId!, query);
	res.status(200).json(page);
}
