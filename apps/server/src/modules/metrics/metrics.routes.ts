import { timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { env } from "../../config/env.js";
import { getMetricsController } from "./metrics.controller.js";

function requireMetricsToken(req: Request, res: Response, next: NextFunction): void {
	const authorization = req.get("authorization");
	const candidate = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
	const expected = env.METRICS_TOKEN ?? "";
	const candidateBuffer = Buffer.from(candidate);
	const expectedBuffer = Buffer.from(expected);
	const isValid =
		candidateBuffer.length === expectedBuffer.length &&
		expectedBuffer.length > 0 &&
		timingSafeEqual(candidateBuffer, expectedBuffer);

	if (!isValid) {
		res.set("WWW-Authenticate", "Bearer");
		res.status(401).json({ error: "Invalid metrics token" });

		return;
	}

	next();
}

export const metricsRouter = Router();
metricsRouter.get("/", requireMetricsToken, getMetricsController);
