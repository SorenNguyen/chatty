import type { CurrentUserDTO } from "@chatty/shared-types";
import { useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { api } from "@/api/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { useAuth } from "@/hooks/use-auth";

interface CurrentUserAvatarProps {
	user: CurrentUserDTO;
}

/**
 * Your own avatar, and the only control that changes it.
 *
 * Clicking the picture opens the file dialog; the small x removes it. Shared
 * rather than owned by `features/chat` because the profile screen shows the
 * same control, and features must not import from each other.
 */
export function CurrentUserAvatar({ user }: CurrentUserAvatarProps) {
	const setCurrentUser = useAuth((state) => state.setCurrentUser);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");

	async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		// Resetting the input is what makes picking the same file twice work: the
		// change event does not fire when the value is unchanged, so re-uploading
		// after a failure would do nothing.
		event.target.value = "";
		if (!file) return;

		setIsSaving(true);
		setError("");
		try {
			setCurrentUser(await api.uploadAvatar(file));
		} catch (uploadError) {
			setError((uploadError as Error).message);
		} finally {
			setIsSaving(false);
		}
	}

	async function handleRemove() {
		setIsSaving(true);
		setError("");
		try {
			setCurrentUser(await api.deleteAvatar());
		} catch (removeError) {
			setError((removeError as Error).message);
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="relative">
			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				onChange={(event) => void handleFileSelected(event)}
				className="hidden"
			/>

			<Button
				variant="ghost"
				onClick={() => fileInputRef.current?.click()}
				disabled={isSaving}
				aria-label="Change your profile picture"
				className="rounded-full p-0 hover:opacity-80"
			>
				<Avatar user={user} size="md" />
			</Button>

			{isSaving && (
				<span
					role="status"
					aria-label="Saving your profile picture"
					className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70"
				>
					<Loader2 className="size-4 animate-spin text-slate-600" />
				</span>
			)}

			{user.avatarUrl && !isSaving && (
				<Button
					variant="ghost"
					onClick={() => void handleRemove()}
					aria-label="Remove your profile picture"
					className="absolute -right-1 -top-1 size-4 rounded-full border border-slate-200 bg-white p-0 text-slate-500 hover:bg-slate-100"
				>
					<X className="size-3" />
				</Button>
			)}

			{error && (
				// Absolutely positioned so a long message cannot push the sidebar
				// header's layout around; z-10 keeps it above the conversation list.
				<p
					role="alert"
					className="absolute left-0 top-full z-10 mt-1 w-48 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 shadow-sm"
				>
					{error}
				</p>
			)}
		</div>
	);
}
