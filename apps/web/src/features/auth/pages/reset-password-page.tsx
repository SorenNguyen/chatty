import { Link, useSearchParams } from "react-router-dom";
import { AuthCard, ResetPasswordForm } from "../components";

export function ResetPasswordPage() {
	const [searchParams] = useSearchParams();
	const token = searchParams.get("token");

	return (
		<AuthCard title="Choose a new password">
			{/* Someone who opened /reset-password by hand, or whose mail client
			    mangled the link. Nothing to submit, so nothing is rendered to
			    submit it with. */}
			{token ? (
				<ResetPasswordForm token={token} />
			) : (
				<p className="text-[13px] text-signal">
					This link is missing its token. Request a new one from the sign-in page.
				</p>
			)}

			<Link to="/login" className="eyebrow mt-5 block text-center text-ink-faint hover:text-ink">
				Back to sign in
			</Link>
		</AuthCard>
	);
}
