import { MessageCircle } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { ResetPasswordForm } from "../components";

export function ResetPasswordPage() {
	const [searchParams] = useSearchParams();
	const token = searchParams.get("token");

	return (
		<main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
			<div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
				<div className="mb-6 flex flex-col items-center gap-2">
					<MessageCircle className="size-8 text-blue-600" />
					<h1 className="text-xl font-semibold text-slate-900">Choose a new password</h1>
				</div>

				{/* Someone who opened /reset-password by hand, or whose mail client
				    mangled the link. Nothing to submit, so nothing is rendered to
				    submit it with. */}
				{token ? (
					<ResetPasswordForm token={token} />
				) : (
					<p className="text-sm text-red-600">
						This link is missing its token. Request a new one from the sign-in page.
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
