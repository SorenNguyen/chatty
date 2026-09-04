import { create } from "zustand";
import { api } from "@/api/client";

interface RestrictedUsersState {
	/** Ids known to be restricted by the signed-in person. */
	restrictedIds: Set<string>;
	/** Ids whose status has been resolved, including known-unrestricted ids. */
	checkedIds: Set<string>;
	/** Fetches one current status; safe to call from every consumer's mount. */
	load: (userId: string) => Promise<void>;
	restrict: (userId: string) => Promise<void>;
	unrestrict: (userId: string) => Promise<void>;
	/** Records a change made elsewhere — another tab, another device. */
	apply: (userId: string, isRestricted: boolean) => void;
	/** Re-resolves every status this session has cached. Used after a reconnect. */
	refresh: () => Promise<void>;
	/** Called on sign-out, so the next account does not inherit this one's list. */
	reset: () => void;
}

const inFlight = new Map<string, Promise<void>>();

/**
 * Who you have restricted, in one place.
 *
 * Mirrors `useBlockedUsers` exactly, for the same reason: the action belongs
 * both beside a conversation and in account privacy settings, a status is
 * loaded only when a person is actionable, and `restriction:changed` is the
 * live counterpart to `refresh` re-resolving what is cached after a reconnect.
 */
export const useRestrictedUsers = create<RestrictedUsersState>((set, get) => ({
	restrictedIds: new Set(),
	checkedIds: new Set(),

	load: async (userId) => {
		if (get().checkedIds.has(userId)) return;
		const existing = inFlight.get(userId);
		if (existing) return existing;

		const request = api
			.getRestrictionStatus(userId)
			.then(({ isRestricted }) => {
				set((state) => {
					const restrictedIds = new Set(state.restrictedIds);
					if (isRestricted) restrictedIds.add(userId);
					else restrictedIds.delete(userId);

					return { restrictedIds, checkedIds: new Set(state.checkedIds).add(userId) };
				});
			})
			.catch(() => {
				// Left unresolved, which reads as "Restrict". That is the safe way to
				// be wrong: the server accepts an idempotent restrict, but never
				// silently offers an unrestrict that could reopen something somebody
				// deliberately hid.
			})
			.finally(() => {
				inFlight.delete(userId);
			});

		inFlight.set(userId, request);

		return request;
	},

	restrict: async (userId) => {
		await api.restrictUser(userId);
		set((state) => ({
			restrictedIds: new Set(state.restrictedIds).add(userId),
			checkedIds: new Set(state.checkedIds).add(userId),
		}));
	},

	unrestrict: async (userId) => {
		await api.unrestrictUser(userId);
		set((state) => {
			const next = new Set(state.restrictedIds);
			next.delete(userId);

			return { restrictedIds: next, checkedIds: new Set(state.checkedIds).add(userId) };
		});
	},

	apply: (userId, isRestricted) => {
		set((state) => {
			const restrictedIds = new Set(state.restrictedIds);
			if (isRestricted) restrictedIds.add(userId);
			else restrictedIds.delete(userId);

			return { restrictedIds, checkedIds: new Set(state.checkedIds).add(userId) };
		});
	},

	refresh: async () => {
		// Bounded by what this session actually asked about, never by the size of
		// the account's restriction list. Dropping `checkedIds` instead would
		// re-resolve nothing: consumers call `load` on mount, not on every render.
		const knownIds = [...get().checkedIds];
		set({ checkedIds: new Set() });
		await Promise.all(knownIds.map((userId) => get().load(userId)));
	},

	reset: () => {
		inFlight.clear();
		set({ restrictedIds: new Set(), checkedIds: new Set() });
	},
}));
