import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import { uploadAttachment } from "../../middlewares/upload-image.js";
import {
	deleteMessageController,
	editMessageController,
	getMessageContextController,
	hideMessageController,
	listMessageEditsController,
	listMessagesController,
	sendMessageController,
	toggleReactionController,
} from "./messages.controller.js";

// Mounted at /conversations/:conversationId/messages — see app.ts
export const messagesRouter = Router({ mergeParams: true });

messagesRouter.use(requireAuth);
messagesRouter.get("/", listMessagesController);
messagesRouter.get("/:messageId/context", getMessageContextController);
messagesRouter.get("/:messageId/edits", listMessageEditsController);
messagesRouter.delete("/:messageId/me", hideMessageController);
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
// PUT, not POST: sending the same reaction twice settles where it started, which
// is the whole behaviour. See the controller.
messagesRouter.put("/:messageId/reactions", toggleReactionController);
