import type { Request, Response } from "express";
import * as blocksService from "./blocks.service.js";
import { blockParamsSchema, listBlockedUsersQuerySchema } from "./blocks.schema.js";

export async function listBlockedUsersController(req: Request, res: Response): Promise<void> {
	const query = listBlockedUsersQuerySchema.parse(req.query);
	res.status(200).json(await blocksService.listBlockedUsers(req.userId!, query));
}

/** Only answers whether the caller themselves blocked this person, never the reverse. */
export async function getBlockStatusController(req: Request, res: Response): Promise<void> {
	const params = blockParamsSchema.parse(req.params);
	res.status(200).json(await blocksService.getBlockStatus(req.userId!, params.userId));
}

/**
 * PUT rather than POST, because blocking somebody already blocked is the same
 * request twice and should answer the same way both times.
 */
export async function blockUserController(req: Request, res: Response): Promise<void> {
	const params = blockParamsSchema.parse(req.params);
	await blocksService.blockUser(req.userId!, params.userId);

	res.status(204).send();
}

export async function unblockUserController(req: Request, res: Response): Promise<void> {
	const params = blockParamsSchema.parse(req.params);
	await blocksService.unblockUser(req.userId!, params.userId);

	res.status(204).send();
}
