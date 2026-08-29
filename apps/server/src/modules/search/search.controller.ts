import type { Request, Response } from "express";
import { searchMessagesQuerySchema } from "./search.schema.js";
import * as searchService from "./search.service.js";

// req.userId is always set here: requireAuth runs before this controller (see search.routes.ts)

export async function searchMessagesController(req: Request, res: Response): Promise<void> {
	const query = searchMessagesQuerySchema.parse(req.query);
	const page = await searchService.searchMessages(req.userId!, query);
	res.status(200).json(page);
}
