import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import {
	addParticipantController,
	archiveConversationController,
	createConversationController,
	getConversationController,
	listConversationsController,
	markReadController,
	muteConversationController,
	pinConversationController,
	removeParticipantController,
	renameConversationController,
	setInvitePolicyController,
	setParticipantRoleController,
	transferOwnershipController,
} from "./conversations.controller.js";

export const conversationsRouter = Router();

conversationsRouter.use(requireAuth);
conversationsRouter.get("/", listConversationsController);
conversationsRouter.post("/", createConversationController);
// One row, for the case pagination creates: a message arrives for a conversation
// the client has not loaded, so there is nothing in the sidebar to patch.
conversationsRouter.get("/:conversationId", getConversationController);
// POST, not PUT: this advances a marker rather than replacing a resource, and
// the server may keep the marker where it is when the client asks to move it
// backwards — so the request is not idempotent in the way PUT promises.
conversationsRouter.post("/:conversationId/read", markReadController);
conversationsRouter.put("/:conversationId/archive", archiveConversationController);
conversationsRouter.put("/:conversationId/pin", pinConversationController);
conversationsRouter.put("/:conversationId/mute", muteConversationController);
conversationsRouter.post("/:conversationId/members", addParticipantController);
// Also how you leave: DELETE .../members/:userId with your own id as the
// target. Removing yourself and being removed are the same operation on the
// same resource — see removeParticipant's doc comment in the service.
conversationsRouter.delete("/:conversationId/members/:userId", removeParticipantController);
conversationsRouter.put("/:conversationId/members/:userId/role", setParticipantRoleController);
conversationsRouter.put("/:conversationId/invite-policy", setInvitePolicyController);
// PUT, not POST: a group has exactly one owner, so this replaces a value rather
// than appending to a collection — and naming the same person twice ends in the
// same state. Its own path segment rather than a field on the rename PATCH,
// because the two have different rules for who may do them and different
// consequences when they race.
conversationsRouter.put("/:conversationId/owner", transferOwnershipController);
// PATCH, not POST: renaming is a partial update of the conversation resource
// itself, and doing it twice with the same name ends in the same state.
conversationsRouter.patch("/:conversationId", renameConversationController);
