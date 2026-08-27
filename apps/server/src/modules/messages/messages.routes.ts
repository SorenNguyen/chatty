import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import { uploadAttachment } from "../../middlewares/upload-image.js";
import {
	deleteMessageController,
	editMessageController,
	listMessagesController,
	sendMessageController,
} from "./messages.controller.js";

// Mounted at /conversations/:conversationId/messages — see app.ts
export const messagesRouter = Router({ mergeParams: true });

messagesRouter.use(requireAuth);
messagesRouter.get("/", listMessagesController);
// `uploadAttachment` parses a multipart body and passes anything else straight
// through, so this one route takes a text message and an image without a branch
// in front of it — and without a second write path to secure.
messagesRouter.post("/", uploadAttachment, sendMessageController);
// PATCH, not PUT: only the text is replaceable, and an edit that carried a new
// image would be a second upload path with its own membership check to secure.
messagesRouter.patch("/:messageId", editMessageController);
// DELETE, even though the row survives as a tombstone. The resource the caller
// is addressing is the message they wrote, and that is what goes — the row that
// stays behind exists for read markers and paging cursors, not for them.
messagesRouter.delete("/:messageId", deleteMessageController);
