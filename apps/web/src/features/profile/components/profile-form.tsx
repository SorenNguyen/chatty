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
 * Edits the things about an account that are yours to change in one request.
 *
 * Email is not one of them, and is not shown here at all any more: moving an
 * account to a new address is a two-step flow that only takes effect when a link
 * in the new mailbox is opened, so it has its own form rather than a field that
 * would appear to save with everything else.
 */
export function ProfileForm({ user }: ProfileFormProps) {
	const setCurrentUser = useAuth((state) => state.setCurrentUser);
	const [fields, setFields] = useState({
		displayName: user.displayName,
		handle: user.handle,
		readReceiptsEnabled: user.readReceiptsEnabled,
	});
	const [errors, setErrors] = useState({ displayName: "", handle: "", form: "" });
	const [isSaving, setIsSaving] = useState(false);
	const [isSaved, setIsSaved] = useState(false);

	// Lowercased before comparing, the same way it is before sending: typing a
	// capital into your own unchanged handle is not an edit.
	const displayName = fields.displayName.trim();
	const handle = fields.handle.trim().toLowerCase();
	const hasChanges =
		displayName !== user.displayName ||
		handle !== user.handle ||
		fields.readReceiptsEnabled !== user.readReceiptsEnabled;

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
			...(fields.readReceiptsEnabled !== user.readReceiptsEnabled && {
				readReceiptsEnabled: fields.readReceiptsEnabled,
			}),
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
			{/* A raw checkbox: the app declares a Button and a TextField and nothing
			    else, and inventing a toggle primitive for its only use would be a
			    component to maintain rather than a decision made. */}
			<label className="flex items-start gap-3 text-sm text-slate-900">
				<input
					type="checkbox"
					checked={fields.readReceiptsEnabled}
					onChange={(event) => {
						setIsSaved(false);
						setFields((current) => ({ ...current, readReceiptsEnabled: event.target.checked }));
					}}
					className="mt-0.5 size-4"
				/>
				<span className="flex flex-col gap-0.5">
					<span className="font-medium">Send read receipts</span>
					{/* The symmetry is said out loud, because it is the part people are
					    surprised by — and being surprised by it after the fact is what
					    makes a setting feel like a trick. */}
					<span className="text-xs text-slate-500">
						Turning this off hides your “Seen” from everyone, and hides theirs from you.
					</span>
				</span>
			</label>

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
