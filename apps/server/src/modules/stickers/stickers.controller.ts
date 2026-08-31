import type { Request, Response } from "express";
import { ATTACHMENT_TOKEN_TTL_SECONDS } from "../../lib/attachment-token.js";
import { ValidationError } from "../../lib/errors.js";
import { stickerParamsSchema, stickerQuerySchema } from "./stickers.schema.js";
import * as stickersService from "./stickers.service.js";

/** Same policy as an attachment: one viewer's, cached no longer than its token. */
const STICKER_CACHE_CONTROL = `private, max-age=${ATTACHMENT_TOKEN_TTL_SECONDS}`;

export async function listStickersController(req: Request, res: Response): Promise<void> {
	res.status(200).json(await stickersService.listStickers(req.userId!));
}

export async function addStickerController(req: Request, res: Response): Promise<void> {
	if (!req.file) throw new ValidationError("A sticker needs an image");

	res.status(201).json(await stickersService.addSticker(req.userId!, req.file.buffer));
}

export async function removeStickerController(req: Request, res: Response): Promise<void> {
	const params = stickerParamsSchema.parse(req.params);
	await stickersService.removeSticker(req.userId!, params.stickerId);

	res.status(204).send();
}

export async function getStickerController(req: Request, res: Response): Promise<void> {
	const params = stickerParamsSchema.parse(req.params);
	const query = stickerQuerySchema.parse(req.query);
	const filePath = await stickersService.getStickerFilePath(params.stickerId, query.token);

	res.setHeader("Cache-Control", STICKER_CACHE_CONTROL);
	// `dotfiles: "allow"` for the reason the attachment endpoint records: the
	// upload directory starts with a dot and Express's `send` refuses such paths.
	res.status(200).sendFile(filePath, { dotfiles: "allow" });
}
