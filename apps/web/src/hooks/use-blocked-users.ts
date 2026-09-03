import { create } from "zustand";
import { api } from "@/api/client";

interface BlockedUsersState {
	/** Ids known to be blocked by the signed-in person. */
	blockedIds: Set<string>;
	/** Ids whose status has been resolved, including known-unblocked ids. */
	checkedIds: Set<string>;
	/** Fetches one current status; safe to call from every consumer's mount. */
	load: (userId: string) => Promise<void>;
	block: (userId: string) => Promise<void>;
	unblock: (userId: string) => Promise<void>;
	/** Records a change made elsewhere — another tab, another device. */
	apply: (userId: string, isBlocked: boolean) => void;
	/** Re-resolves every status this session has cached. Used after a reconnect. */
	refresh: () => Promise<void>;
	/** Called on sign-out, so the next account does not inherit this one's list. */
	reset: () => void;
}

const inFlight = new Map<string, Promise<void>>();

/**
 * Who you have blocked, in one place.
 *
 * This is shared rather than chat-owned because the action belongs both beside
 * a conversation and in account privacy settings. The old version loaded every
 * blocked id in one response; a status is now loaded only when a person is
 * actionable, then cached for the session.
 *
 * A cache for the whole session needs somebody to invalidate it, and blocking is
 * exactly the setting somebody changes from their phone with the laptop still
 * open. `apply` takes the `block:changed` event for the live case; `refresh`
 * re-resolves what is cached after a reconnect, for the window the socket was
 * down and the event went nowhere. Without both, a second session keeps offering
 * "Block" for somebody already blocked, or holds a composer disabled after the
 * block was lifted.
 */
export const useBlockedUsers = create<BlockedUsersState>((set, get) => ({
	blockedIds: new Set(),
	checkedIds: new Set(),

	load: async (userId) => {
		if (get().checkedIds.has(userId)) return;
		const existing = inFlight.get(userId);
		if (existing) return existing;

		const request = api
			.getBlockStatus(userId)
			.then(({ isBlocked }) => {
				set((state) => {
					const blockedIds = new Set(state.blockedIds);
					if (isBlocked) blockedIds.add(userId);
					else blockedIds.delete(userId);

					return { blockedIds, checkedIds: new Set(state.checkedIds).add(userId) };
				});
			})
			.catch(() => {
				// Left unresolved, which reads as "Block". That is the safe way to be
				// wrong: the server accepts an idempotent block, but never silently
				// offers an unblock that could reopen contact somebody ended.
			})
			.finally(() => {
				inFlight.delete(userId);
			});

		inFlight.set(userId, request);

		return request;
	},

	block: async (userId) => {
		await api.blockUser(userId);
		set((state) => ({
			blockedIds: new Set(state.blockedIds).add(userId),
			checkedIds: new Set(state.checkedIds).add(userId),
		}));
	},

	unblock: async (userId) => {
		await api.unblockUser(userId);
		set((state) => {
			const next = new Set(state.blockedIds);
			next.delete(userId);

			return { blockedIds: next, checkedIds: new Set(state.checkedIds).add(userId) };
		});
	},

	apply: (userId, isBlocked) => {
		set((state) => {
			const blockedIds = new Set(state.blockedIds);
			if (isBlocked) blockedIds.add(userId);
			else blockedIds.delete(userId);

			return { blockedIds, checkedIds: new Set(state.checkedIds).add(userId) };
		});
	},

	refresh: async () => {
		// Bounded by what this session actually asked about, never by the size of
		// the account's block list. Dropping `checkedIds` instead would re-resolve
		// nothing: consumers call `load` on mount, not on every render.
		const knownIds = [...get().checkedIds];
		set({ checkedIds: new Set() });
		await Promise.all(knownIds.map((userId) => get().load(userId)));
	},

	reset: () => {
		inFlight.clear();
		set({ blockedIds: new Set(), checkedIds: new Set() });
	},
}));
