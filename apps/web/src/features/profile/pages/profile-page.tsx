import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { CurrentUserAvatar } from "@/components/current-user-avatar";
import { useAuth } from "@/hooks/use-auth";
import { ChangeEmailForm, ChangePasswordForm, DeleteAccountForm, ProfileForm } from "../components";

/**
 * Account settings, on its own route rather than a panel inside the chat.
 *
 * Every other secondary surface in this app renders inline — starting a
 * conversation, managing a group — because those act on the conversation that
 * is on screen. This one does not: it edits the account, and putting it in the
 * chat sidebar would mean `features/chat` importing from `features/profile`,
 * which the frontend conventions rule out. A route keeps the two features
 * apart and gives the screen a URL worth having.
 */
export function ProfilePage() {
	const currentUser = useAuth((state) => state.currentUser);

	// The route in app.tsx already redirects when there is no session; this keeps
	// TypeScript honest without an assertion, the same way ChatPage does.
	if (!currentUser) return null;

	return (
		<main className="min-h-screen bg-slate-50 p-4">
			<div className="mx-auto flex w-full max-w-lg flex-col gap-6">
				<Link
					to="/chat"
					className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
				>
					<ArrowLeft className="size-4" />
					Back to chat
				</Link>

				<section className="rounded-2xl bg-white p-6 shadow-sm">
					<div className="mb-6 flex items-center gap-4">
						<CurrentUserAvatar user={currentUser} />
						<div className="min-w-0">
							<h1 className="truncate text-lg font-semibold text-slate-900">{currentUser.displayName}</h1>
							<p className="truncate text-sm text-slate-500">@{currentUser.handle}</p>
						</div>
					</div>

					<ProfileForm user={currentUser} />
				</section>

				<section className="rounded-2xl bg-white p-6 shadow-sm">
					<h2 className="mb-4 text-base font-semibold text-slate-900">Change email</h2>
					<ChangeEmailForm user={currentUser} />
				</section>

				<section className="rounded-2xl bg-white p-6 shadow-sm">
					<h2 className="mb-4 text-base font-semibold text-slate-900">Change password</h2>
					<ChangePasswordForm />
				</section>

				{/* Last, and visually apart from the rest: everything above this line is
				    reversible and nothing below it is. */}
				<section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
					<h2 className="mb-4 text-base font-semibold text-red-700">Delete account</h2>
					<DeleteAccountForm />
				</section>
			</div>
		</main>
	);
}
