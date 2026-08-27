import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * The boot-time rules that decide how mail leaves — and, more importantly, when
 * the process refuses to start at all.
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
