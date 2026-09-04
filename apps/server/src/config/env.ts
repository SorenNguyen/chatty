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
	/**
	 * Where Redis is, if there is one. **Optional, and that is a decision.**
	 *
	 * With it, rate-limit counters and Socket.io rooms are shared, so more than
	 * one instance behaves like one system. Without it both fall back to this
	 * process's memory, which is correct for a single instance and wrong the
	 * moment there are two — each keeps its own tally, and a socket in one
	 * process cannot reach a room in the other.
	 *
	 * Required would be the safer-looking choice and the worse one: it would mean
	 * `npm run verify` and every `npm run dev:server` needed a Redis container to
	 * start. In production the guard is `SINGLE_INSTANCE` below — say which shape
	 * you are, or do not start.
	 */
	REDIS_URL: z.string().url().optional(),
	/**
	 * States that this deployment is deliberately one process, and that running
	 * without Redis is therefore correct.
	 *
	 * The README's largest known gap was that more than one instance *requires*
	 * `REDIS_URL` and nothing enforced it: without Redis each process keeps its
	 * own rate-limit counters and its own socket rooms, so a second instance
	 * silently loses every message the first one broadcasts. A warning at boot
	 * was the old guard, and a warning is a thing people scroll past.
	 *
	 * It cannot simply be required in production, because a single instance in
	 * production is a legitimate shape — it is the first deployment this project
	 * will have. So the rule is a declaration rather than a dependency: in
	 * production, either point at Redis or say out loud that there is only one of
	 * you. Getting neither is the case that used to fail silently.
	 */
	SINGLE_INSTANCE: z
		.enum(["true", "false"])
		.optional()
		.transform((value) => value === "true"),
	/**
	 * Which mail transport to use. **Explicit, and there is no default.**
	 *
	 * `mailer.ts` used to hard-code its one implementation, with a comment saying
	 * an env var would be worse: a half-configured provider that silently falls
	 * back to the console is how a password reset appears to work in production
	 * and reaches nobody. That reasoning was right about the failure and wrong
	 * about the cause — the danger is the *silence*, not the variable.
	 *
	 * So the variable exists and the silence does not. Choosing `smtp` without
	 * the settings below fails this schema, which fails the boot. Choosing
	 * `console` in production fails it too. There is no path where the app starts
	 * and quietly writes password reset links to a log file nobody reads.
	 */
	MAIL_TRANSPORT: z.enum(["console", "smtp"]),
	/**
	 * The SMTP server, as a URL: `smtp://user:pass@host:port` — or `smtps://` for
	 * implicit TLS on 465. Required when `MAIL_TRANSPORT=smtp`, refused otherwise.
	 *
	 * A URL rather than five separate variables because every provider documents
	 * it this way, and because five variables is five chances to set four of them.
	 *
	 * The scheme is checked rather than left to `.url()`, which is not the same
	 * thing: `new URL("localhost:1025")` parses happily — it reads `localhost:` as
	 * the scheme — so `.url()` alone accepts exactly the host:port string someone
	 * pastes out of a provider's docs when they miss the prefix. That would then
	 * fail at the first send, hours later, in a worker.
	 */
	SMTP_URL: z
		.string()
		.url()
		.refine((value) => /^smtps?:\/\//.test(value), { message: "SMTP_URL must start with smtp:// or smtps://" })
		.optional(),
	/** The From: address. Required with `smtp`; providers reject unverified senders. */
	MAIL_FROM: z.string().email().optional(),
	/**
	 * Protects the Prometheus endpoint. Metrics reveal traffic volume, failure
	 * rates and resource pressure, so production refuses to expose them under a
	 * weak or missing credential. Optional in development because the route is
	 * omitted entirely when no token is configured.
	 */
	METRICS_TOKEN: z.string().min(32).optional(),
});

const parsed = envSchema
	.superRefine((value, context) => {
		// Cross-field rules live here rather than in the fields above, because a
		// single field cannot see the transport it is supposed to belong to.
		if (value.MAIL_TRANSPORT === "smtp") {
			for (const key of ["SMTP_URL", "MAIL_FROM"] as const) {
				if (!value[key]) {
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: [key],
						message: `${key} is required when MAIL_TRANSPORT is "smtp"`,
					});
				}
			}
		}

		// Shared state, or a signed statement that none is needed. Two instances
		// without Redis do not fail — they quietly behave as two separate apps,
		// and a message sent to one never reaches anyone connected to the other.
		if (value.NODE_ENV === "production" && !value.REDIS_URL && !value.SINGLE_INSTANCE) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["REDIS_URL"],
				message:
					"In production, set REDIS_URL so instances share rate limits and socket rooms — " +
					'or set SINGLE_INSTANCE="true" to state that this deployment is one process.',
			});
		}

		if (value.NODE_ENV === "production" && !value.METRICS_TOKEN) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["METRICS_TOKEN"],
				message: "METRICS_TOKEN is required in production so operational data is not public",
			});
		}

		// The one that matters. A production deployment that forgets to configure
		// mail must not start and pretend: every reset link would go to stdout.
		if (value.MAIL_TRANSPORT === "console" && value.NODE_ENV === "production") {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["MAIL_TRANSPORT"],
				message: 'MAIL_TRANSPORT="console" writes reset links to the log and must not be used in production',
			});
		}
	})
	.parse(process.env);

export const env = parsed;
