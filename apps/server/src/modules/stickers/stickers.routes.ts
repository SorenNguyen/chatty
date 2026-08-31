import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import { uploadSticker } from "../../middlewares/upload-image.js";
import {
	addStickerController,
	getStickerController,
	listStickersController,
	removeStickerController,
} from "./stickers.controller.js";

export const stickersRouter = Router();

// Unauthenticated, like `GET /attachments/:id` and for the same reason: an
// `<img>` cannot send an Authorization header, so the signed token in the query
// is the credential. Mounted before `requireAuth` so the guard below misses it.
stickersRouter.get("/:stickerId", getStickerController);

stickersRouter.use(requireAuth);
stickersRouter.get("/", listStickersController);
stickersRouter.post("/", uploadSticker, addStickerController);
stickersRouter.delete("/:stickerId", removeStickerController);
