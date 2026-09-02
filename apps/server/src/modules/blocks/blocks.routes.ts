import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import { blockUserController, listBlockedUsersController, unblockUserController } from "./blocks.controller.js";

export const blocksRouter = Router();

blocksRouter.use(requireAuth);
blocksRouter.get("/", listBlockedUsersController);
blocksRouter.put("/:userId", blockUserController);
blocksRouter.delete("/:userId", unblockUserController);
