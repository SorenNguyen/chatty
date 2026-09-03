import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import {
	getRestrictionStatusController,
	listRestrictedUsersController,
	restrictUserController,
	unrestrictUserController,
} from "./restrictions.controller.js";

export const restrictionsRouter = Router();

restrictionsRouter.use(requireAuth);
restrictionsRouter.get("/", listRestrictedUsersController);
restrictionsRouter.get("/:userId/status", getRestrictionStatusController);
restrictionsRouter.put("/:userId", restrictUserController);
restrictionsRouter.delete("/:userId", unrestrictUserController);
