import type { CurrentUserDTO, RegisterRequest } from "@chatty/shared-types";
import { create } from "zustand";
import { api, clearStoredToken, getStoredToken, storeToken } from "@/api/client";
import { closeSocket } from "@/lib/socket";

interface AuthState {
	currentUser: CurrentUserDTO | null;
	/** True until the stored token has been checked, so routes do not redirect too early. */
	isRestoring: boolean;
	login: (email: string, password: string) => Promise<void>;
	register: (input: RegisterRequest) => Promise<void>;
	/**
	 * Changes the password and keeps this tab signed in.
	 *
	 * Here rather than in the form because it is a session operation, not a
	 * profile one: the server invalidates every token on the account, so the
	 * replacement has to be stored and the socket — which authenticated with the
	 * old one and has just been disconnected by the server — has to be dropped so
	 * the next consumer opens a fresh one. `logout` is in this store for exactly
	 * the same reason.
	 */
	changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
	logout: () => void;
	restoreSession: () => Promise<void>;
	/**
	 * Replaces the cached profile after the user changes it themselves.
	 *
	 * Exists because the profile is not only read at sign-in any more: changing
	 * an avatar returns a new `avatarUrl`, and without writing it back here the
	 * header would keep rendering the previous version until the next reload.
	 */
	setCurrentUser: (user: CurrentUserDTO) => void;
}

/**
 * Shared rather than owned by features/auth: the chat screens need to know who
 * "me" is to tell my messages from everyone else's, and features must never
 * import from each other.
 */
export const useAuth = create<AuthState>((set) => ({
	currentUser: null,
	isRestoring: true,

	async login(email, password) {
		const { token } = await api.login({ email, password });
		storeToken(token);
		set({ currentUser: await api.getCurrentUser() });
	},

	async register(input) {
		const { token } = await api.register(input);
		storeToken(token);
		set({ currentUser: await api.getCurrentUser() });
	},

	setCurrentUser(user) {
		set({ currentUser: user });
	},

	async changePassword(currentPassword, newPassword) {
		const { token } = await api.changePassword({ currentPassword, newPassword });
		storeToken(token);
		// The old socket cannot be reused: the server closed it, and socket.io
		// would reconnect with the token it captured when it was created — the one
		// that no longer works. Dropping it makes the next getSocket() build one
		// with the token just stored.
		closeSocket();
	},

	logout() {
		clearStoredToken();
		// The socket authenticated with the old token; leaving it open would keep
		// pushing the previous user's messages into the next user's session.
		closeSocket();
		set({ currentUser: null });
	},

	async restoreSession() {
		if (!getStoredToken()) {
			set({ isRestoring: false });

			return;
		}

		try {
			set({ currentUser: await api.getCurrentUser(), isRestoring: false });
		} catch {
			// Expired or tampered token — drop it rather than leaving the app in a
			// half-authenticated state where every request 401s.
			clearStoredToken();
			set({ currentUser: null, isRestoring: false });
		}
	},
}));
