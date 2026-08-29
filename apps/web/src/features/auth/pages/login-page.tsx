import { useState } from "react";
import { Button } from "@/components/button";
import { LoginForm, RegisterForm } from "../components";

export function LoginPage() {
	const [mode, setMode] = useState<"login" | "register">("login");
	const isLogin = mode === "login";

	return (
		<main className="flex min-h-screen items-center justify-center bg-paper p-4">
			<div className="w-full max-w-sm rounded-xl border border-rule bg-paper-raised p-8">
				<div className="mb-6 flex flex-col items-center gap-2">
					<span className="flex items-baseline gap-1.5">
						<span className="font-display text-3xl leading-none tracking-tight">Chatty</span>
						<span aria-hidden="true" className="size-1.5 bg-signal" />
					</span>
					<p className="eyebrow text-center text-ink-faint">
						{isLogin ? "Sign in to continue" : "Create an account to start chatting"}
					</p>
				</div>

				{isLogin ? <LoginForm /> : <RegisterForm />}

				<Button variant="ghost" className="mt-4 w-full" onClick={() => setMode(isLogin ? "register" : "login")}>
					{isLogin ? "No account? Create one" : "Already have an account? Sign in"}
				</Button>
			</div>
		</main>
	);
}
