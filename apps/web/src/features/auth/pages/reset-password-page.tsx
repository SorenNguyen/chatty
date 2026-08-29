import { Link, useSearchParams } from "react-router-dom";
import { ResetPasswordForm } from "../components";

export function ResetPasswordPage() {
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
					<h1 className="mt-1 text-base font-semibold tracking-tight text-ink">Choose a new password</h1>
				</div>

				{/* Someone who opened /reset-password by hand, or whose mail client
				    mangled the link. Nothing to submit, so nothing is rendered to
				    submit it with. */}
				{token ? (
					<ResetPasswordForm token={token} />
				) : (
					<p className="eyebrow text-signal">
						This link is missing its token. Request a new one from the sign-in page.
					</p>
				)}

				<Link to="/login" className="mt-4 block text-center text-sm font-medium text-ink-soft hover:text-ink">
					Back to sign in
				</Link>
			</div>
		</main>
	);
}
