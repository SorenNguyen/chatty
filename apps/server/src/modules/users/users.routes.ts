import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import { uploadAvatar } from "../../middlewares/upload-image.js";
import {
	deleteAvatarController,
	getAvatarController,
	getMeController,
	searchUsersController,
	updateProfileController,
	uploadAvatarController,
} from "./users.controller.js";

export const usersRouter = Router();

/**
 * One of the app's two unauthenticated routes — the other serves attachments —
 * and the placement above `requireAuth` is what makes it so.
 *
 * An `<img>` tag cannot send an Authorization header, and this app keeps its
 * token in localStorage rather than a cookie. Guarding the endpoint would mean
 * fetching every avatar with `fetch` and turning it into an object URL, which
 * throws away HTTP caching and re-downloads every face on every render. What is
 * exposed instead is a profile picture, addressed by a cuid nobody can guess —
 * the same trade Rocket.Chat makes by serving `/avatar/:username` openly.
 *
 * That reasoning does **not** carry over to message attachments, which are
 * private content rather than a public face: `GET /attachments/:id` requires a
 * signed, expiring token in the URL. See ADR 0007.
 */
usersRouter.get("/:userId/avatar", getAvatarController);

usersRouter.use(requireAuth);
// Declared before "/" would be, and distinct from it, so "@me" is never read as a search term.
usersRouter.get("/me", getMeController);
usersRouter.patch("/me", updateProfileController);
usersRouter.post("/me/avatar", uploadAvatar, uploadAvatarController);
usersRouter.delete("/me/avatar", deleteAvatarController);
usersRouter.get("/", searchUsersController);
