import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { attachmentsRouter } from "./modules/attachments/attachments.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { conversationsRouter } from "./modules/conversations/conversations.routes.js";
import { messagesRouter } from "./modules/messages/messages.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

/**
 * Wires up the Express app: middleware, then routes, then the error handler
 * last (Express dispatches to it whenever a handler throws or rejects).
 * No route logic lives here — see modules/*.
 */
export function createApp() {
	const app = express();

	app.use(cors({ origin: env.CORS_ORIGIN }));
	app.use(express.json());

	app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

	app.use("/auth", authRouter);
	app.use("/attachments", attachmentsRouter);
	app.use("/users", usersRouter);
	app.use("/conversations", conversationsRouter);
	app.use("/conversations/:conversationId/messages", messagesRouter);

	app.use(errorHandler);

	return app;
}
