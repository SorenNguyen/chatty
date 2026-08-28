import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";

interface ConfirmEmailFormProps {
	token: string;
}

/**
 * Redeems an email-change link, on arrival.
 *
 * A form with no fields and no button, because there is nothing left to ask: the
 * person got here by opening a link in the mailbox being confirmed, which is the
 * entire proof the server wants. Every other link in this app lands on something
 * to fill in — a new password — and this one would only be a button labelled
 * "yes, the thing you already clicked".
 *
 * The ref guard is load-bearing rather than tidy. StrictMode runs every effect
 * twice in development, and a cleanup flag is not enough here: it suppresses the
 * first run's *state update*, not its *request*. Both would be sent, the second
 * would find the token already spent, and the screen would report failure for a
 * change that had in fact worked. A ref survives StrictMode's simulated remount,
 * so the request happens once.
 */
export function ConfirmEmailForm({ token }: ConfirmEmailFormProps) {
	const [status, setStatus] = useState<"confirming" | "confirmed" | "failed">("confirming");
	const [error, setError] = useState("");
	const hasSentRef = useRef(false);

	useEffect(() => {
		if (hasSentRef.current) return;
		hasSentRef.current = true;

		void api
			.confirmEmailChange({ token })
			.then(() => setStatus("confirmed"))
			.catch((confirmError: unknown) => {
				setError((confirmError as Error).message);
				setStatus("failed");
			});
	}, [token]);

	if (status === "confirming") return <p className="text-sm text-slate-500">Confirming…</p>;

	if (status === "failed") {
		return (
			<p role="alert" className="text-sm text-red-600">
				{error}
			</p>
		);
	}

	return (
		<p className="text-sm text-green-700">
			Your email address has been updated. Sign in with it from now on — your password has not changed.
		</p>
	);
}
