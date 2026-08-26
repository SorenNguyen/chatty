import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ForgotPasswordPage } from "@/features/auth/pages/forgot-password-page";
import { LoginPage } from "@/features/auth/pages/login-page";
import { ResetPasswordPage } from "@/features/auth/pages/reset-password-page";
import { ChatPage } from "@/features/chat/pages/chat-page";
import { ProfilePage } from "@/features/profile/pages/profile-page";
import { useAuth } from "@/hooks/use-auth";

export function App() {
	const currentUser = useAuth((state) => state.currentUser);
	const isRestoring = useAuth((state) => state.isRestoring);
	const restoreSession = useAuth((state) => state.restoreSession);

	useEffect(() => {
		void restoreSession();
	}, [restoreSession]);

	// Without this gate, a reload would bounce an authenticated user to /login for
	// the moment before the stored token has been checked.
	if (isRestoring) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-slate-50">
				<p className="text-sm text-slate-500">Loading…</p>
			</div>
		);
	}

	return (
		<BrowserRouter>
			<Routes>
				<Route path="/login" element={currentUser ? <Navigate to="/chat" replace /> : <LoginPage />} />
				{/* Reachable while signed in as well as out. Someone who is still
				    logged in on this device may well be the person who asked for the
				    link, and bouncing them to /chat would strand the email. */}
				<Route path="/forgot-password" element={<ForgotPasswordPage />} />
				<Route path="/reset-password" element={<ResetPasswordPage />} />
				<Route path="/chat" element={currentUser ? <ChatPage /> : <Navigate to="/login" replace />} />
				<Route path="/profile" element={currentUser ? <ProfilePage /> : <Navigate to="/login" replace />} />
				<Route path="*" element={<Navigate to={currentUser ? "/chat" : "/login"} replace />} />
			</Routes>
		</BrowserRouter>
	);
}
