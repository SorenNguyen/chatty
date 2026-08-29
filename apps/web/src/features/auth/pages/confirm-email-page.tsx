import { Link, useSearchParams } from "react-router-dom";
import { AuthCard, ConfirmEmailForm } from "../components";

/**
 * Where the link in the new mailbox lands.
 *
 * In `features/auth` rather than `features/profile`, even though the change was
 * started from the settings dialog: this page is reached without a session, from
 * a device that may never have had one, and every other tokened link in the app
 * lives here for the same reason.
 */
export function ConfirmEmailPage() {
	const [searchParams] = useSearchParams();
	const token = searchParams.get("token");

	return (
		<AuthCard title="Confirm your email">
			{/* Same guard as the reset page: a link opened by hand, or mangled on
			    the way through a mail client, has nothing to redeem. */}
			{token ? (
				<ConfirmEmailForm token={token} />
			) : (
				<p className="text-[13px] text-signal">
					This link is missing its token. Ask for a new one from your account settings.
				</p>
			)}

			<Link to="/login" className="eyebrow mt-5 block text-center text-ink-faint hover:text-ink">
				Back to sign in
			</Link>
		</AuthCard>
	);
}
