import type { CurrentUserDTO, UpdateProfileRequest } from "@chatty/shared-types";
import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { HANDLE_PATTERN, MAX_HANDLE_LENGTH, MIN_HANDLE_LENGTH } from "@/constants/validation";
import { useAuth } from "@/hooks/use-auth";

interface ProfileFormProps {
	user: CurrentUserDTO;
}

/**
 * Edits the two things about an account that are yours to change.
 *
 * Email is shown but not editable: changing it has to prove the new address is
 * reachable, which needs the outbound email that password reset is also waiting
 * on. Rendering it read-only is more honest than leaving it off the screen, so
 * nobody goes looking for it somewhere else.
 */
export function ProfileForm({ user }: ProfileFormProps) {
	const setCurrentUser = useAuth((state) => state.setCurrentUser);
	const [fields, setFields] = useState({ displayName: user.displayName, handle: user.handle });
	const [errors, setErrors] = useState({ displayName: "", handle: "", form: "" });
	const [isSaving, setIsSaving] = useState(false);
	const [isSaved, setIsSaved] = useState(false);

	// Lowercased before comparing, the same way it is before sending: typing a
	// capital into your own unchanged handle is not an edit.
	const displayName = fields.displayName.trim();
	const handle = fields.handle.trim().toLowerCase();
	const hasChanges = displayName !== user.displayName || handle !== user.handle;

	function validate() {
		const nextErrors = { displayName: "", handle: "", form: "" };

		if (!displayName) nextErrors.displayName = "Display name is required";

		if (handle.length < MIN_HANDLE_LENGTH || handle.length > MAX_HANDLE_LENGTH) {
			nextErrors.handle = `Handle must be ${MIN_HANDLE_LENGTH}–${MAX_HANDLE_LENGTH} characters`;
		} else if (!HANDLE_PATTERN.test(handle)) {
			nextErrors.handle = "Start with a letter; letters, numbers and underscores only";
		}

		setErrors(nextErrors);

		return !nextErrors.displayName && !nextErrors.handle;
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!validate()) return;

		// Only what actually changed goes up. The server would accept the whole
		// object, but a request carrying a field nobody touched is a request that
		// can overwrite an edit made in another tab.
		const input: UpdateProfileRequest = {
			...(displayName !== user.displayName && { displayName }),
			...(handle !== user.handle && { handle }),
		};

		setIsSaving(true);
		setIsSaved(false);
		try {
			setCurrentUser(await api.updateProfile(input));
			setIsSaved(true);
		} catch (error) {
			// "Handle already taken" arrives here — the server is the only thing
			// that can know it, so the message is shown as sent.
			setErrors((current) => ({ ...current, form: (error as Error).message }));
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<TextField
				label="Display name"
				autoComplete="name"
				value={fields.displayName}
				error={errors.displayName}
				onChange={(event) => {
					setIsSaved(false);
					setFields((current) => ({ ...current, displayName: event.target.value }));
				}}
			/>
			<TextField
				label="Handle"
				autoComplete="username"
				value={fields.handle}
				error={errors.handle}
				onChange={(event) => {
					setIsSaved(false);
					setFields((current) => ({ ...current, handle: event.target.value }));
				}}
			/>
			<TextField label="Email" type="email" value={user.email} readOnly disabled autoComplete="email" />

			{errors.form && (
				<p role="alert" className="text-sm text-red-600">
					{errors.form}
				</p>
			)}
			{/* Cleared by every onChange below, so it cannot linger over a later edit.
			    Guarding this on `hasChanges` as well would tie the message to the
			    parent passing a refreshed `user` back down — true in the app, and
			    an invisible dependency for anything else that renders this. */}
			{isSaved && <p className="text-sm text-green-700">Profile saved</p>}

			<Button type="submit" disabled={isSaving || !hasChanges}>
				{isSaving ? "Saving…" : "Save changes"}
			</Button>
		</form>
	);
}
