import { useState } from "react";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { useAuth } from "@/hooks/use-auth";

export function LoginForm() {
	const login = useAuth((state) => state.login);
	const [fields, setFields] = useState({ email: "", password: "" });
	const [errors, setErrors] = useState({ email: "", password: "", form: "" });
	const [isSubmitting, setIsSubmitting] = useState(false);

	function validate() {
		const nextErrors = { email: "", password: "", form: "" };

		if (!fields.email.trim()) nextErrors.email = "Email is required";
		if (!fields.password) nextErrors.password = "Password is required";

		setErrors(nextErrors);

		return !nextErrors.email && !nextErrors.password;
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!validate()) return;

		setIsSubmitting(true);
		try {
			await login(fields.email.trim(), fields.password);
		} catch (error) {
			// The server returns one message for both a wrong password and an
			// unknown email; showing it verbatim keeps that indistinguishable.
			setErrors((current) => ({ ...current, form: (error as Error).message }));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<TextField
				label="Email"
				type="email"
				autoComplete="email"
				value={fields.email}
				error={errors.email}
				onChange={(event) => setFields((current) => ({ ...current, email: event.target.value }))}
			/>
			<TextField
				label="Password"
				type="password"
				autoComplete="current-password"
				value={fields.password}
				error={errors.password}
				onChange={(event) => setFields((current) => ({ ...current, password: event.target.value }))}
			/>

			{errors.form && <p className="text-sm text-red-600">{errors.form}</p>}

			<Button type="submit" disabled={isSubmitting}>
				{isSubmitting ? "Signing in…" : "Sign in"}
			</Button>
		</form>
	);
}
