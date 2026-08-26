import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import { uploadAttachment } from "../../middlewares/upload-image.js";
import { listMessagesController, sendMessageController } from "./messages.controller.js";

// Mounted at /conversations/:conversationId/messages — see app.ts
export const messagesRouter = Router({ mergeParams: true });

messagesRouter.use(requireAuth);
messagesRouter.get("/", listMessagesController);
// `uploadAttachment` parses a multipart body and passes anything else straight
// through, so this one route takes a text message and an image without a branch
// in front of it — and without a second write path to secure.
messagesRouter.post("/", uploadAttachment, sendMessageController);
