import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import { listMessagesController, sendMessageController } from "./messages.controller.js";

// Mounted at /conversations/:conversationId/messages — see app.ts
export const messagesRouter = Router({ mergeParams: true });

messagesRouter.use(requireAuth);
messagesRouter.get("/", listMessagesController);
messagesRouter.post("/", sendMessageController);
