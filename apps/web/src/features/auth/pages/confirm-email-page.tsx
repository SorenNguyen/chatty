import { MessageCircle } from "lucide-react";
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
		<main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
			<div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
				<div className="mb-6 flex flex-col items-center gap-2">
					<MessageCircle className="size-8 text-blue-600" />
					<h1 className="text-xl font-semibold text-slate-900">Confirm your email</h1>
				</div>

				{/* Same guard as the reset page: a link opened by hand, or mangled on
				    the way through a mail client, has nothing to redeem. */}
				{token ? (
					<ConfirmEmailForm token={token} />
				) : (
					<p className="text-sm text-red-600">
						This link is missing its token. Ask for a new one from your profile.
					</p>
				)}

				<Link
					to="/login"
					className="mt-4 block text-center text-sm font-medium text-slate-600 hover:text-slate-900"
				>
					Back to sign in
				</Link>
			</div>
		</main>
	);
}
