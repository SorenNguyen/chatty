import type { Request, Response } from "express";
import * as restrictionsService from "./restrictions.service.js";
import { listRestrictedUsersQuerySchema, restrictionParamsSchema } from "./restrictions.schema.js";

export async function listRestrictedUsersController(req: Request, res: Response): Promise<void> {
	const query = listRestrictedUsersQuerySchema.parse(req.query);
	res.status(200).json(await restrictionsService.listRestrictedUsers(req.userId!, query));
}

/** Only answers whether the caller themselves restricted this person, never the reverse. */
export async function getRestrictionStatusController(req: Request, res: Response): Promise<void> {
	const params = restrictionParamsSchema.parse(req.params);
	res.status(200).json(await restrictionsService.getRestrictionStatus(req.userId!, params.userId));
}

/**
 * PUT rather than POST, because restricting somebody already restricted is the
 * same request twice and should answer the same way both times.
 */
export async function restrictUserController(req: Request, res: Response): Promise<void> {
	const params = restrictionParamsSchema.parse(req.params);
	await restrictionsService.restrictUser(req.userId!, params.userId);

	res.status(204).send();
}

export async function unrestrictUserController(req: Request, res: Response): Promise<void> {
	const params = restrictionParamsSchema.parse(req.params);
	await restrictionsService.unrestrictUser(req.userId!, params.userId);

	res.status(204).send();
}
