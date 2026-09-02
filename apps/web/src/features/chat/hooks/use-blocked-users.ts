import { create } from "zustand";
import { api } from "@/api/client";

interface BlockedUsersState {
	/** Ids of everyone the signed-in person has blocked. */
	blockedIds: Set<string>;
	hasLoaded: boolean;
	/** Fetches once per session. Safe to call from every consumer's mount. */
	load: () => Promise<void>;
	block: (userId: string) => Promise<void>;
	unblock: (userId: string) => Promise<void>;
	/** Called on sign-out, so the next account does not inherit this one's list. */
	reset: () => void;
}

let inFlight: Promise<void> | null = null;

/**
 * Who you have blocked, in one place.
 *
 * A store rather than a hook with local state because two very different
 * surfaces need the same answer: the details panel, and the actions menu on
 * **every row** of the sidebar. Asking per row would be one request per
 * conversation on every render of the list, to answer a question whose answer is
 * a handful of ids.
 *
 * `inFlight` single-flights the fetch for the same reason the token refresh does
 * it: thirty rows mounting at once would otherwise send thirty identical
 * requests before the first one answered.
 *
 * Written through rather than refetched — the server is the authority, but it
 * has just been told what the answer is, and a round trip to be told again is a
 * spinner on a button that has already done its job.
 */
export const useBlockedUsers = create<BlockedUsersState>((set, get) => ({
	blockedIds: new Set(),
	hasLoaded: false,

	load: async () => {
		if (get().hasLoaded || inFlight) return inFlight ?? undefined;

		inFlight = api
			.listBlockedUsers()
			.then((users) => {
				set({ blockedIds: new Set(users.map((user) => user.id)), hasLoaded: true });
			})
			.catch(() => {
				// Left unloaded, which reads as "nobody is blocked". The safe way to be
				// wrong: a control then offers "Block", which the server accepts, rather
				// than offering "Unblock" and quietly reopening contact somebody ended.
			})
			.finally(() => {
				inFlight = null;
			});

		return inFlight;
	},

	block: async (userId) => {
		await api.blockUser(userId);
		set((state) => ({ blockedIds: new Set(state.blockedIds).add(userId) }));
	},

	unblock: async (userId) => {
		await api.unblockUser(userId);
		set((state) => {
			const next = new Set(state.blockedIds);
			next.delete(userId);

			return { blockedIds: next };
		});
	},

	reset: () => set({ blockedIds: new Set(), hasLoaded: false }),
}));
