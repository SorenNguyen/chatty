import { Router } from "express";
import { requireAuth } from "../../middlewares/require-auth.js";
import { searchMessagesController } from "./search.controller.js";

// Mounted at /search — see app.ts
export const searchRouter = Router();

searchRouter.use(requireAuth);
// GET with the query in the query string, not POST with a body. A search is a
// read: it should be linkable, cacheable in principle, and safe to retry.
searchRouter.get("/messages", searchMessagesController);
