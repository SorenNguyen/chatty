import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import {
	listConversationLinksController,
	listConversationMediaController,
	listSavedMessagesController,
} from "./vault.controller.js";

export const conversationVaultRouter = Router({ mergeParams: true });
conversationVaultRouter.use(requireAuth);
conversationVaultRouter.get("/media", listConversationMediaController);
conversationVaultRouter.get("/links", listConversationLinksController);

export const personalVaultRouter = Router();
personalVaultRouter.use(requireAuth);
personalVaultRouter.get("/saved", listSavedMessagesController);
