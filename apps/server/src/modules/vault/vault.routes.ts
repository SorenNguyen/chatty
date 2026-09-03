import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import {
	getConversationVaultSummaryController,
	listConversationLinksController,
	listConversationMediaController,
	listSavedMessagesController,
} from "./vault.controller.js";

export const conversationVaultRouter = Router({ mergeParams: true });
conversationVaultRouter.use(requireAuth);
// Before either list, and cheaper than both: the panel opens on the categories
// and their counts, and fetches a page only once one is picked.
conversationVaultRouter.get("/vault-summary", getConversationVaultSummaryController);
conversationVaultRouter.get("/media", listConversationMediaController);
conversationVaultRouter.get("/links", listConversationLinksController);

export const personalVaultRouter = Router();
personalVaultRouter.use(requireAuth);
personalVaultRouter.get("/saved", listSavedMessagesController);
