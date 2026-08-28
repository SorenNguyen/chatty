import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * The boot-time rules that refuse to start a misconfigured deployment.
 *
 * Mail is most of them, and the Redis declaration below joins them for the same
 * reason: both are configurations that used to start anyway and fail silently
 * afterwards.
 *
 * `config/env.ts` parses `process.env` at import time and exports the result, so
 * it cannot be re-parsed with different values from a test. The schema is
 * therefore restated here, reduced to the fields these rules involve.
 *
 * A copy is normally the wrong answer, and it is the right one here: what is
 * under test is a *policy* — "a half-configured mailer must not boot" — and the
 * cost of the copy is that a change to the real schema must be mirrored. The
 * alternative is exporting a factory purely so a test can reach it, which shapes
 * production code around the suite. Keep them in step; the four cases below are
 * the reason the policy exists.
 */
const mailEnvSchema = z
	.object({
		NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
		REDIS_URL: z.string().url().optional(),
		SINGLE_INSTANCE: z
			.enum(["true", "false"])
			.optional()
			.transform((value) => value === "true"),
		MAIL_TRANSPORT: z.enum(["console", "smtp"]),
		SMTP_URL: z
			.string()
			.url()
			.refine((value) => /^smtps?:\/\//.test(value), { message: "SMTP_URL must start with smtp:// or smtps://" })
			.optional(),
		MAIL_FROM: z.string().email().optional(),
	})
	.superRefine((value, context) => {
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

		if (value.NODE_ENV === "production" && !value.REDIS_URL && !value.SINGLE_INSTANCE) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["REDIS_URL"],
				message:
					"In production, set REDIS_URL so instances share rate limits and socket rooms — " +
					'or set SINGLE_INSTANCE="true" to state that this deployment is one process.',
			});
		}

		if (value.MAIL_TRANSPORT === "console" && value.NODE_ENV === "production") {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["MAIL_TRANSPORT"],
				message: 'MAIL_TRANSPORT="console" writes reset links to the log and must not be used in production',
			});
		}
	});

const SMTP = { SMTP_URL: "smtp://user:pass@localhost:1025", MAIL_FROM: "no-reply@chatty.test" };

describe("mail configuration", () => {
	it("accepts a fully configured SMTP transport", () => {
		expect(() => mailEnvSchema.parse({ MAIL_TRANSPORT: "smtp", ...SMTP })).not.toThrow();
	});

	it("accepts the console transport outside production", () => {
		expect(() => mailEnvSchema.parse({ MAIL_TRANSPORT: "console", NODE_ENV: "development" })).not.toThrow();
	});

	it("refuses to start with no transport chosen at all", () => {
		// No default, on purpose. A deployment that never thought about mail should
		// find out at boot rather than by a user not receiving a reset link.
		expect(() => mailEnvSchema.parse({})).toThrow();
	});

	it("refuses SMTP with no server to send through", () => {
		// The failure this whole policy exists for: a half-configured provider that
		// starts anyway, falls back to a log, and appears to work.
		expect(() => mailEnvSchema.parse({ MAIL_TRANSPORT: "smtp", MAIL_FROM: SMTP.MAIL_FROM })).toThrow(/SMTP_URL/);
	});

	it("refuses SMTP with no sender address", () => {
		expect(() => mailEnvSchema.parse({ MAIL_TRANSPORT: "smtp", SMTP_URL: SMTP.SMTP_URL })).toThrow(/MAIL_FROM/);
	});

	it("refuses the console transport in production", () => {
		// Every password reset link would go to stdout.
		expect(() => mailEnvSchema.parse({ MAIL_TRANSPORT: "console", NODE_ENV: "production" })).toThrow(
			/must not be used in production/,
		);
	});

	it("refuses an SMTP URL with the scheme left off", () => {
		// `new URL("localhost:1025")` parses — it reads `localhost:` as the scheme —
		// so `.url()` on its own accepts precisely the host:port string someone
		// pastes when they miss the prefix. Found by this test failing against a
		// schema that only had `.url()`.
		expect(() =>
			mailEnvSchema.parse({ MAIL_TRANSPORT: "smtp", SMTP_URL: "localhost:1025", MAIL_FROM: SMTP.MAIL_FROM }),
		).toThrow(/smtp:\/\//);
	});

	it("accepts implicit TLS on smtps://", () => {
		expect(() =>
			mailEnvSchema.parse({
				MAIL_TRANSPORT: "smtp",
				SMTP_URL: "smtps://user:pass@smtp.provider.test:465",
				MAIL_FROM: SMTP.MAIL_FROM,
			}),
		).not.toThrow();
	});

	it("refuses a sender that is not an address", () => {
		expect(() =>
			mailEnvSchema.parse({ MAIL_TRANSPORT: "smtp", SMTP_URL: SMTP.SMTP_URL, MAIL_FROM: "no-reply" }),
		).toThrow();
	});
});

/** Everything below is `MAIL_TRANSPORT=smtp` plus its settings, kept out of the way. */
const PRODUCTION = { NODE_ENV: "production", MAIL_TRANSPORT: "smtp", ...SMTP } as const;

describe("shared-state configuration", () => {
	it("refuses production with neither Redis nor a declaration", () => {
		// The README's largest known gap: more than one instance requires
		// REDIS_URL, and nothing enforced it. Two instances without Redis do not
		// fail — they behave as two separate apps, and a message sent to one never
		// reaches anyone connected to the other. The old guard was a log warning.
		expect(() => mailEnvSchema.parse(PRODUCTION)).toThrow(/REDIS_URL/);
	});

	it("accepts production with Redis", () => {
		expect(() => mailEnvSchema.parse({ ...PRODUCTION, REDIS_URL: "redis://redis:6379" })).not.toThrow();
	});

	it("accepts production when the operator states there is only one instance", () => {
		// Not merely permitted — this is the first deployment's actual shape, and
		// requiring Redis outright would have made a single machine impossible to
		// run. The rule is a declaration, not a dependency.
		expect(() => mailEnvSchema.parse({ ...PRODUCTION, SINGLE_INSTANCE: "true" })).not.toThrow();
	});

	it("does not accept the declaration turned off as an answer", () => {
		// `SINGLE_INSTANCE=false` says "there is more than one of me", which is the
		// case that most needs Redis.
		expect(() => mailEnvSchema.parse({ ...PRODUCTION, SINGLE_INSTANCE: "false" })).toThrow(/REDIS_URL/);
	});

	it("leaves development alone", () => {
		// `npm run dev:server` must not need a Redis container.
		expect(() => mailEnvSchema.parse({ NODE_ENV: "development", MAIL_TRANSPORT: "console" })).not.toThrow();
	});
});
