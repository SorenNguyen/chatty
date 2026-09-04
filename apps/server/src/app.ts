import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { checkReadiness } from "./lib/readiness.js";
import { attachmentsRouter } from "./modules/attachments/attachments.routes.js";
import { stickersRouter } from "./modules/stickers/stickers.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { blocksRouter } from "./modules/blocks/blocks.routes.js";
import { conversationsRouter } from "./modules/conversations/conversations.routes.js";
import { messagesRouter } from "./modules/messages/messages.routes.js";
import { restrictionsRouter } from "./modules/restrictions/restrictions.routes.js";
import { searchRouter } from "./modules/search/search.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { conversationVaultRouter, personalVaultRouter } from "./modules/vault/vault.routes.js";

/**
 * Wires up the Express app: middleware, then routes, then the error handler
 * last (Express dispatches to it whenever a handler throws or rejects).
 * No route logic lives here — see modules/*.
 */
export function createApp() {
	const app = express();

	app.use(
		helmet({
			// **The one default that had to change, and it is not obvious.**
			//
			// Helmet sets `Cross-Origin-Resource-Policy: same-origin`, which is the
			// right default for a server that renders its own pages. This one does
			// not: avatars and attachments are served from here and displayed in an
			// `<img>` on the web app's origin, which is a different origin in every
			// environment this app has. Left at the default, every picture in the
			// product silently stops loading — and no test that asserts on a JSON
			// body can see it, because the response is a perfectly good 200 that the
			// browser then refuses to paint.
			crossOriginResourcePolicy: { policy: "cross-origin" },
			// This is a JSON and image API with no HTML of its own, so a policy about
			// what scripts a page may load has nothing to govern here. The web app's
			// CSP belongs in the server that sends the HTML — see apps/web/nginx.conf.
			contentSecurityPolicy: false,
		}),
	);
	// `credentials: true` is what lets the refresh-token cookie cross from the web
	// app's origin to this one — without it the browser refuses to send or store
	// it, no matter what the `Set-Cookie` response says. It requires `origin` to
	// name an exact origin rather than "*", which `CORS_ORIGIN` already does.
	app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
	app.use(express.json());
	app.use(cookieParser());

	/**
	 * Liveness: this process is running and can answer. Deliberately checks
	 * nothing else — a liveness probe that fails when the database blinks gets
	 * the process killed and restarted, which is the one response that cannot
	 * help.
	 */
	app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

	/**
	 * Readiness: this process can actually serve a request.
	 *
	 * A separate endpoint because the two questions have different answers and
	 * opposite remedies. A rolling deploy routes on this one: without it, traffic
	 * moves to a new instance the moment its port is open, which is before its
	 * database connection exists.
	 */
	app.get("/ready", async (_req, res) => {
		const readiness = await checkReadiness();

		res.status(readiness.ok ? 200 : 503).json(readiness);
	});

	app.use("/auth", authRouter);
	app.use("/attachments", attachmentsRouter);
	app.use("/stickers", stickersRouter);
	app.use("/users", usersRouter);
	app.use("/search", searchRouter);
	app.use("/blocks", blocksRouter);
	app.use("/restrictions", restrictionsRouter);
	app.use("/conversations", conversationsRouter);
	app.use("/conversations/:conversationId", conversationVaultRouter);
	app.use("/conversations/:conversationId/messages", messagesRouter);
	app.use("/me", personalVaultRouter);

	app.use(errorHandler);

	return app;
}
