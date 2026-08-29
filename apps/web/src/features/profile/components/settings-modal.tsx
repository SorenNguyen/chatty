import type { CurrentUserDTO } from "@chatty/shared-types";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/button";
import { CurrentUserAvatar } from "@/components/current-user-avatar";
import { cn } from "@/utils/cn";
import { ChangeEmailForm } from "./change-email-form";
import { ChangePasswordForm } from "./change-password-form";
import { DeleteAccountForm } from "./delete-account-form";
import { ProfileForm } from "./profile-form";
import { SETTINGS_NAVIGATION } from "../constants/settings";
import type { SettingsSection } from "../types/settings";

interface SettingsModalProps {
	user: CurrentUserDTO;
	onClose: () => void;
}

/**
 * Account settings, over the conversation rather than instead of it.
 *
 * This used to be a full page at /profile, and the cost of that was paid on
 * every visit: renaming yourself is a twenty-second job, and a whole-screen
 * route made it feel like leaving the app to do it — you lost the conversation
 * you were reading and came back to the top of the list. A modal keeps the
 * thread behind it, and Escape is a cheaper exit than finding a back arrow.
 *
 * The route survives the change. /profile still resolves, and still renders the
 * chat with this open on top, so a bookmark or a link into settings works and
 * the browser's back button closes it — the two things a purely local `isOpen`
 * flag would have quietly thrown away.
 */
export function SettingsModal({ user, onClose }: SettingsModalProps) {
	const [activeSection, setActiveSection] = useState<SettingsSection>("profile");
	const activeItem = SETTINGS_NAVIGATION.find((item) => item.id === activeSection) ?? SETTINGS_NAVIGATION[0]!;

	// Escape closes. Bound to the document rather than to the panel because the
	// key has to work before anything inside has been focused, which is the state
	// the modal opens in.
	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
		}

		document.addEventListener("keydown", handleKeyDown);

		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-6">
			{/* The scrim is a button so that clicking away closes, and so that the
			    "click away" affordance is reachable from a keyboard at all rather
			    than being a mouse-only escape hatch. */}
			<Button
				variant="ghost"
				onClick={onClose}
				aria-label="Close settings"
				className="absolute inset-0 size-full rounded-none bg-ink/30 hover:bg-ink/30"
			>
				<span className="sr-only">Close settings</span>
			</Button>

			<div
				role="dialog"
				aria-modal="true"
				aria-label="Account settings"
				className="relative flex h-[640px] max-h-full w-[920px] max-w-full overflow-hidden rounded-xl border border-rule bg-paper shadow-[0_40px_80px_-20px_rgba(40,30,20,0.35)]"
			>
				<div className="flex w-[250px] shrink-0 flex-col border-r border-rule bg-paper-raised max-sm:w-20">
					<p className="px-5 pb-4 pt-6 font-display text-[1.375rem] leading-none max-sm:hidden">
						Your account
					</p>

					<div className="flex items-center gap-3 px-5 pb-5 max-sm:justify-center max-sm:px-2 max-sm:pt-6">
						<CurrentUserAvatar user={user} size="sm" />
						<div className="min-w-0 max-sm:hidden">
							<p className="truncate text-[0.8125rem] font-semibold leading-tight">{user.displayName}</p>
							<p className="meta truncate text-ink-faint">@{user.handle}</p>
						</div>
					</div>

					<nav aria-label="Settings categories" className="flex flex-col gap-px border-t border-rule p-2.5">
						{SETTINGS_NAVIGATION.map((item) => {
							const isActive = activeSection === item.id;
							const isDanger = item.id === "danger";
							const NavigationIcon = item.icon;

							return (
								<Button
									key={item.id}
									variant="ghost"
									onClick={() => setActiveSection(item.id)}
									aria-current={isActive ? "page" : undefined}
									aria-label={item.label}
									className={cn(
										"relative w-full justify-start gap-3 rounded-md px-3 py-2.5 text-[0.8125rem] font-medium max-sm:justify-center max-sm:px-0",
										isActive && "bg-paper text-ink",
										!isActive && isDanger && "text-signal hover:bg-signal-soft hover:text-signal",
									)}
								>
									{/* The 2px bar is the same mark the selected conversation
									    row carries, so "this is the one you are on" looks the
									    same on both sides of the app. */}
									{isActive && (
										<span
											aria-hidden="true"
											className="absolute inset-y-2 left-0 w-0.5 bg-signal"
										/>
									)}
									<NavigationIcon
										className={cn("size-4 shrink-0", !isActive && !isDanger && "text-ink-faint")}
										strokeWidth={1.75}
									/>
									<span className="max-sm:hidden">{item.label}</span>
								</Button>
							);
						})}
					</nav>
				</div>

				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex items-start justify-between gap-4 border-b border-rule px-7 py-5">
						<div className="min-w-0">
							<h2
								className={cn(
									"text-lg font-bold tracking-tight",
									activeSection === "danger" ? "text-signal" : "text-ink",
								)}
							>
								{activeItem.label}
							</h2>
							<p className="mt-1 text-[0.8125rem] text-ink-soft">{activeItem.description}</p>
						</div>

						<Button
							variant="ghost"
							onClick={onClose}
							aria-label="Close settings"
							className="size-8 shrink-0 rounded-md border border-rule p-0"
						>
							<X className="size-4" strokeWidth={1.75} />
						</Button>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
						{activeSection === "profile" && <ProfileForm user={user} />}
						{activeSection === "email" && <ChangeEmailForm user={user} />}
						{activeSection === "security" && <ChangePasswordForm />}
						{activeSection === "danger" && <DeleteAccountForm />}
					</div>

					<p className="eyebrow shrink-0 border-t border-rule bg-paper-raised px-7 py-3.5 text-ink-faint">
						Esc to close
					</p>
				</div>
			</div>
		</div>
	);
}
