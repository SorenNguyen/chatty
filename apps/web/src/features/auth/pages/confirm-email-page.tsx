import { Link, useSearchParams } from "react-router-dom";
import { ConfirmEmailForm } from "../components";

/**
 * Where the link in the new mailbox lands.
 *
 * In `features/auth` rather than `features/profile`, even though the change was
 * started from the profile screen: this page is reached without a session, from
 * a device that may never have had one, and every other tokened link in the app
 * lives here for the same reason.
 */
export function ConfirmEmailPage() {
	const [searchParams] = useSearchParams();
	const token = searchParams.get("token");

	return (
		<main className="flex min-h-screen items-center justify-center bg-paper p-4">
			<div className="w-full max-w-sm rounded-xl border border-rule bg-paper-raised p-8">
				<div className="mb-6 flex flex-col items-center gap-2">
					<span className="flex items-baseline gap-1.5">
						<span className="font-display text-3xl leading-none tracking-tight">Chatty</span>
						<span aria-hidden="true" className="size-1.5 bg-signal" />
					</span>
					<h1 className="mt-1 text-base font-semibold tracking-tight text-ink">Confirm your email</h1>
				</div>

				{/* Same guard as the reset page: a link opened by hand, or mangled on
				    the way through a mail client, has nothing to redeem. */}
				{token ? (
					<ConfirmEmailForm token={token} />
				) : (
					<p className="eyebrow text-signal">
						This link is missing its token. Ask for a new one from your profile.
					</p>
				)}

				<Link to="/login" className="mt-4 block text-center text-sm font-medium text-ink-soft hover:text-ink">
					Back to sign in
				</Link>
			</div>
		</main>
	);
}
