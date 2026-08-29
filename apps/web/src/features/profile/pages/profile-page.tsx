import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { CurrentUserAvatar } from "@/components/current-user-avatar";
import { Button } from "@/components/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/utils/cn";
import { ChangeEmailForm, ChangePasswordForm, DeleteAccountForm, ProfileForm } from "../components";
import { SETTINGS_NAVIGATION } from "../constants/settings";
import type { SettingsSection } from "../types/settings";

/** Account settings in the same quiet, two-column shell as the conversation view. */
export function ProfilePage() {
	const currentUser = useAuth((state) => state.currentUser);
	const [activeSection, setActiveSection] = useState<SettingsSection>("profile");

	if (!currentUser) return null;

	const activeItem = SETTINGS_NAVIGATION.find((item) => item.id === activeSection) ?? SETTINGS_NAVIGATION[0]!;

	return (
		<main className="flex h-screen overflow-hidden bg-white">
			<aside className="flex w-[352px] shrink-0 flex-col border-r border-slate-200 max-sm:w-20">
				<header className="flex h-[72px] shrink-0 items-center gap-3 border-b border-slate-200 px-4 max-sm:justify-center max-sm:px-2">
					<Link
						to="/chat"
						aria-label="Back to chat"
						className="flex size-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
					>
						<ArrowLeft className="size-5" />
					</Link>
					<h1 className="text-base font-semibold text-slate-900 max-sm:hidden">Settings</h1>
				</header>

				<div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 max-sm:justify-center max-sm:px-2">
					<CurrentUserAvatar user={currentUser} />
					<div className="min-w-0 max-sm:hidden">
						<p className="truncate text-sm font-semibold text-slate-900">{currentUser.displayName}</p>
						<p className="truncate text-xs text-slate-500">@{currentUser.handle}</p>
					</div>
				</div>

				<nav aria-label="Settings categories" className="py-2">
					{SETTINGS_NAVIGATION.map((item) => (
						<Button
							key={item.id}
							variant="ghost"
							onClick={() => setActiveSection(item.id)}
							aria-current={activeSection === item.id ? "page" : undefined}
							aria-label={item.label}
							className={cn(
								"w-full border-l-2 px-5 py-3 text-left text-sm transition max-sm:px-2 max-sm:text-center max-sm:text-xs",
								activeSection === item.id
									? "border-blue-600 bg-blue-50 font-medium text-blue-700"
									: "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900",
							)}
						>
							{item.label}
						</Button>
					))}
				</nav>
			</aside>

			<section className="min-w-0 flex-1 overflow-y-auto">
				<div className="mx-auto w-full max-w-xl px-6 py-12 sm:px-10">
					<header className="mb-8 border-b border-slate-200 pb-5">
						<h2
							className={cn(
								"text-xl font-semibold",
								activeSection === "danger" ? "text-red-700" : "text-slate-900",
							)}
						>
							{activeItem.label}
						</h2>
						<p className="mt-1 text-sm text-slate-500">{activeItem.description}</p>
					</header>

					{activeSection === "profile" && <ProfileForm user={currentUser} />}
					{activeSection === "email" && <ChangeEmailForm user={currentUser} />}
					{activeSection === "security" && <ChangePasswordForm />}
					{activeSection === "danger" && <DeleteAccountForm />}
				</div>
			</section>
		</main>
	);
}
