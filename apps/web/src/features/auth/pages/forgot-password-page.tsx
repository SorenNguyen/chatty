import { Link } from "react-router-dom";
import { AuthCard, ForgotPasswordForm } from "../components";

export function ForgotPasswordPage() {
	return (
		<AuthCard
			title="Forgot your password?"
			description="Enter your email and we will send you a link to choose a new one."
		>
			<ForgotPasswordForm />

			<Link to="/login" className="eyebrow mt-5 block text-center text-ink-faint hover:text-ink">
				Back to sign in
			</Link>
		</AuthCard>
	);
}
