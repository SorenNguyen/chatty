import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Outbound email, behind an interface with one implementation.
 *
 * The interface is the point. Password reset is the only feature in this project
 * that cannot be finished inside the repository — it needs a provider, an API
 * key and a verified sending domain, none of which a test can stand in for. So
 * the flow is built against this contract and the provider stays a single file:
 * writing a `ResendMailer` or an `SmtpMailer` and swapping `mailer` below is the
 * whole change, and nothing in `auth.service.ts` moves.
 *
 * The console transport is not a mock. It is what development uses, and it
 * prints the link so the flow can actually be walked end to end without an
 * inbox — the same role `console.log` plays for a Stripe webhook nobody can
 * receive locally.
 */

export interface Mail {
	to: string;
	subject: string;
	/** Plain text. HTML mail is a provider concern, not this interface's. */
	body: string;
}

export interface Mailer {
	send(mail: Mail): Promise<void>;
}

/**
 * Writes the message to the log instead of sending it.
 *
 * Logged at `warn`, not `info`, so it stands out in a busy dev log — the whole
 * reason it exists is to be found and clicked.
 */
class ConsoleMailer implements Mailer {
	async send(mail: Mail): Promise<void> {
		logger.warn({ to: mail.to, subject: mail.subject }, `email not sent — no provider configured:\n${mail.body}`);
	}
}

/**
 * The one instance the app uses.
 *
 * A real deployment replaces this line. It deliberately does not branch on an
 * env var: a half-configured provider that silently falls back to the console
 * is how a password reset appears to work in production and reaches nobody.
 * Making the swap a code change means it is reviewed.
 */
export const mailer: Mailer = new ConsoleMailer();

/** The link a reset email carries, pointed at the web app rather than the API. */
export function buildPasswordResetUrl(token: string): string {
	// CORS_ORIGIN is where the web app is served from — the same value that is
	// already the authority on "which origin is this API's front end".
	return `${env.CORS_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
}
