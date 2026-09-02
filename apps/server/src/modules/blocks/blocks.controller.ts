import type { Request, Response } from "express";
import * as blocksService from "./blocks.service.js";
import { blockParamsSchema } from "./blocks.schema.js";

export async function listBlockedUsersController(req: Request, res: Response): Promise<void> {
	res.status(200).json(await blocksService.listBlockedUsers(req.userId!));
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
