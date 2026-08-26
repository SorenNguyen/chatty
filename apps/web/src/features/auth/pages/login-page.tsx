import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/button";
import { LoginForm, RegisterForm } from "../components";

export function LoginPage() {
	const [mode, setMode] = useState<"login" | "register">("login");
	const isLogin = mode === "login";

	return (
		<main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
			<div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
				<div className="mb-6 flex flex-col items-center gap-2">
					<MessageCircle className="size-8 text-blue-600" />
					<h1 className="text-xl font-semibold text-slate-900">Chatty</h1>
					<p className="text-sm text-slate-500">
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
