import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, clearStoredToken, NetworkUnavailableError } from "@/api/client";
import { useAuth } from "@/hooks/use-auth";
import { readCachedCurrentUser } from "@/lib/local-chat-store";
import { makeCurrentUser } from "./factories";

vi.mock("@/api/client", () => {
	class MockNetworkUnavailableError extends Error {}

	return {
		api: { getCurrentUser: vi.fn() },
		clearStoredToken: vi.fn(),
		getStoredToken: vi.fn(() => "stored-token"),
		NetworkUnavailableError: MockNetworkUnavailableError,
		storeSession: vi.fn(),
	};
});
vi.mock("@/lib/local-chat-store", () => ({
	cacheCurrentUser: vi.fn(),
	clearLocalUserData: vi.fn(),
	readCachedCurrentUser: vi.fn(),
}));
vi.mock("@/hooks/use-blocked-users", () => ({ useBlockedUsers: { getState: () => ({ reset: vi.fn() }) } }));
vi.mock("@/hooks/use-restricted-users", () => ({ useRestrictedUsers: { getState: () => ({ reset: vi.fn() }) } }));
vi.mock("@/lib/socket", () => ({ closeSocket: vi.fn() }));

beforeEach(() => {
	vi.mocked(api.getCurrentUser).mockReset();
	vi.mocked(clearStoredToken).mockReset();
	vi.mocked(readCachedCurrentUser).mockReset();
	useAuth.setState({ currentUser: null, isRestoring: true });
});

describe("offline session restore", () => {
	it("opens the cached account only when the server was unreachable", async () => {
		const cached = makeCurrentUser({ id: "offline-user" });
		vi.mocked(api.getCurrentUser).mockRejectedValue(new NetworkUnavailableError());
		vi.mocked(readCachedCurrentUser).mockResolvedValue(cached);

		await useAuth.getState().restoreSession();

		expect(useAuth.getState()).toMatchObject({ currentUser: cached, isRestoring: false });
		expect(clearStoredToken).not.toHaveBeenCalled();
	});

	it("does not treat an invalid HTTP session as an offline session", async () => {
		vi.mocked(api.getCurrentUser).mockRejectedValue(new Error("Unauthorized"));
		vi.mocked(readCachedCurrentUser).mockResolvedValue(makeCurrentUser({ id: "stale-user" }));

		await useAuth.getState().restoreSession();

		expect(useAuth.getState()).toMatchObject({ currentUser: null, isRestoring: false });
		expect(clearStoredToken).toHaveBeenCalledOnce();
		expect(readCachedCurrentUser).not.toHaveBeenCalled();
	});
});
