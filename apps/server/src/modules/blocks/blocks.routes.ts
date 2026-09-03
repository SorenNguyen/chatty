import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import {
	blockUserController,
	getBlockStatusController,
	listBlockedUsersController,
	unblockUserController,
} from "./blocks.controller.js";

export const blocksRouter = Router();

blocksRouter.use(requireAuth);
blocksRouter.get("/", listBlockedUsersController);
blocksRouter.get("/:userId/status", getBlockStatusController);
blocksRouter.put("/:userId", blockUserController);
blocksRouter.delete("/:userId", unblockUserController);
