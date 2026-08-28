import type { Request, Response } from "express";
import { ValidationError } from "../../lib/errors.js";
import {
	avatarParamsSchema,
	deleteAccountSchema,
	searchUsersQuerySchema,
	updateProfileSchema,
} from "./users.schema.js";
import * as usersService from "./users.service.js";

// req.userId is always set here: requireAuth runs before these controllers
// (see users.routes.ts) — except in getAvatarController, which is public.

/**
 * A year, and immutable. Safe only because the URL carries the upload timestamp:
 * changing a picture changes the URL, so nothing cached under the old one is
 * ever the answer to a later request.
 */
const AVATAR_CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function getMeController(req: Request, res: Response): Promise<void> {
	const user = await usersService.getUserById(req.userId!);

	res.status(200).json(user);
}

export async function updateProfileController(req: Request, res: Response): Promise<void> {
	const input = updateProfileSchema.parse(req.body);
	const user = await usersService.updateProfile(req.userId!, input);

	res.status(200).json(user);
}

export async function deleteAccountController(req: Request, res: Response): Promise<void> {
	const input = deleteAccountSchema.parse(req.body);
	await usersService.deleteAccount(req.userId!, input);

	// No body. There is no profile left to return, and the client's next act is to
	// throw away the token it made this request with.
	res.status(204).send();
}

export async function searchUsersController(req: Request, res: Response): Promise<void> {
	const query = searchUsersQuerySchema.parse(req.query);
	const users = await usersService.searchUsers(req.userId!, query);

	res.status(200).json(users);
}

export async function uploadAvatarController(req: Request, res: Response): Promise<void> {
	// The upload middleware guarantees the shape of a file that *is* there, but
	// not that one was sent at all — a request with no part named "avatar" parses
	// perfectly well and leaves this undefined.
	if (!req.file) throw new ValidationError('Attach an image in an "avatar" field');

	const user = await usersService.setAvatar(req.userId!, req.file.buffer);

	res.status(200).json(user);
}

export async function deleteAvatarController(req: Request, res: Response): Promise<void> {
	const user = await usersService.clearAvatar(req.userId!);

	res.status(200).json(user);
}

export async function getAvatarController(req: Request, res: Response): Promise<void> {
	const params = avatarParamsSchema.parse(req.params);
	const filePath = await usersService.getAvatarFilePath(params.userId);

	res.setHeader("Cache-Control", AVATAR_CACHE_CONTROL);
	// `dotfiles: "allow"` is required, not optional. Express's `send` refuses any
	// path with a segment starting with a dot and answers 404 — and the default
	// upload directory is `.data/uploads`, so every avatar is behind one. The
	// protection it turns off is aimed at user-supplied paths; nothing here is
	// one. The id is checked against [A-Za-z0-9_-]+ before it becomes a path and
	// the extension is fixed, so no request can introduce a dot segment of its own.
	res.status(200).sendFile(filePath, { dotfiles: "allow" });
}
