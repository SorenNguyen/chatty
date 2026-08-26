import { MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { ForgotPasswordForm } from "../components";

export function ForgotPasswordPage() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
			<div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
				<div className="mb-6 flex flex-col items-center gap-2">
					<MessageCircle className="size-8 text-blue-600" />
					<h1 className="text-xl font-semibold text-slate-900">Forgot your password?</h1>
					<p className="text-center text-sm text-slate-500">
						Enter your email and we will send you a link to choose a new one.
					</p>
				</div>

				<ForgotPasswordForm />

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
