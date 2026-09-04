import type { Request, Response } from "express";
import { metricsRegistry } from "../../lib/metrics.js";

export async function getMetricsController(_req: Request, res: Response): Promise<void> {
	res.set("Content-Type", metricsRegistry.contentType);
	res.set("Cache-Control", "no-store");
	res.status(200).send(await metricsRegistry.metrics());
}
