import type { NextFunction, Request, Response } from "express";
import { getRouteGroup, observeHttpRequestBytes, startHttpRequestTimer } from "../lib/metrics.js";

/**
 * Measures the HTTP boundary without using paths, ids, handles or other
 * user-controlled values as labels. A metrics endpoint that grows one time
 * series per conversation would eventually become its own memory leak.
 */
export function observeHttp(req: Request, res: Response, next: NextFunction): void {
	const routeGroup = getRouteGroup(req.originalUrl);
	if (routeGroup === "metrics") return next();

	const stopTimer = startHttpRequestTimer(req.method, routeGroup);
	observeHttpRequestBytes(routeGroup, req.get("content-length"));
	res.once("finish", () => stopTimer(res.statusCode));

	next();
}
