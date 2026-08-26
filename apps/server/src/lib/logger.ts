import pino from "pino";
import { env } from "../config/env.js";

/**
 * Structured (JSON) logging instead of console.log. In production this can
 * be piped straight into a log aggregator; in dev, pino-pretty (optional,
 * not installed by default) makes it readable.
 */
export const logger = pino({
	level: env.NODE_ENV === "production" ? "info" : "debug",
});
