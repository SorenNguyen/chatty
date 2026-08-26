import "dotenv/config";
import { z } from "zod";

/**
 * Validate process.env once at startup instead of reading `process.env.X`
 * throughout the codebase. If a required var is missing, the app fails to
 * boot with a clear error instead of crashing later with `undefined is not
 * a function` somewhere deep in a request handler.
 */
const envSchema = z.object({
	DATABASE_URL: z.string().min(1),
	JWT_SECRET: z.string().min(1),
	PORT: z.coerce.number().default(4000),
	CORS_ORIGIN: z.string().min(1),
	NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
	/**
	 * How this API is reachable from a browser. Used to build absolute avatar
	 * URLs, which have to work in an `<img src>` on the web app's own origin —
	 * a relative path there would resolve against the Vite dev server (:5173),
	 * not against this process.
	 */
	PUBLIC_URL: z.string().url().default("http://localhost:4000"),
	/**
	 * Where uploaded files are written. Relative paths resolve against the
	 * server's working directory (`apps/server`), so the default sits beside the
	 * Postgres volume in `.data/` and is gitignored with it.
	 */
	UPLOAD_DIR: z.string().min(1).default(".data/uploads"),
});

export const env = envSchema.parse(process.env);
