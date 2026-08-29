import { Link } from "react-router-dom";
import { ForgotPasswordForm } from "../components";

export function ForgotPasswordPage() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-paper p-4">
			<div className="w-full max-w-sm rounded-xl border border-rule bg-paper-raised p-8">
				<div className="mb-6 flex flex-col items-center gap-2">
					<span className="flex items-baseline gap-1.5">
						<span className="font-display text-3xl leading-none tracking-tight">Chatty</span>
						<span aria-hidden="true" className="size-1.5 bg-signal" />
					</span>
					<h1 className="mt-1 text-base font-semibold tracking-tight text-ink">Forgot your password?</h1>
					<p className="eyebrow text-center text-ink-faint">
						Enter your email and we will send you a link to choose a new one.
					</p>
				</div>

				<ForgotPasswordForm />

				<Link to="/login" className="mt-4 block text-center text-sm font-medium text-ink-soft hover:text-ink">
					Back to sign in
				</Link>
			</div>
		</main>
	);
}
