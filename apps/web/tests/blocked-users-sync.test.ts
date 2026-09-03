import type { ServerToClientEvents } from "@chatty/shared-types";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { useBlockedUsersSync } from "@/features/chat/hooks/use-blocked-users-sync";
import { useBlockedUsers } from "@/hooks/use-blocked-users";

type SocketHandler = (payload: unknown) => void;
const { socketHandlers } = vi.hoisted(() => ({ socketHandlers: new Map<string, SocketHandler>() }));

vi.mock("@/api/client", () => ({
	api: {
		getBlockStatus: vi.fn(),
	},
}));
vi.mock("@/features/chat/hooks/use-socket-event", () => ({
	useSocketEvent: (eventName: string, handler: SocketHandler) => socketHandlers.set(eventName, handler),
}));

function emit<EventName extends keyof ServerToClientEvents>(
	eventName: EventName,
	payload: Parameters<ServerToClientEvents[EventName]>[0],
): void {
	act(() => socketHandlers.get(eventName)?.(payload));
}

beforeEach(() => {
	useBlockedUsers.getState().reset();
	vi.mocked(api.getBlockStatus).mockReset().mockResolvedValue({ isBlocked: true });
});

/**
 * The store caches a status for the whole session, so these are the two things
 * that keep one account's sessions in agreement about it: the `block:changed`
 * event while the socket is up, and a re-resolve of what is cached after it has
 * been down.
 */
describe("useBlockedUsers", () => {
	it("takes a change made in another session without asking the server", async () => {
		await useBlockedUsers.getState().load("linh");
		expect(useBlockedUsers.getState().blockedIds.has("linh")).toBe(true);

		useBlockedUsers.getState().apply("linh", false);

		expect(useBlockedUsers.getState().blockedIds.has("linh")).toBe(false);
		// Still resolved, so a consumer mounting now offers "Block" rather than
		// firing a second request for an answer the event already carried.
		expect(useBlockedUsers.getState().checkedIds.has("linh")).toBe(true);
		expect(api.getBlockStatus).toHaveBeenCalledTimes(1);
	});

	it("re-resolves only the ids this session cached", async () => {
		await useBlockedUsers.getState().load("linh");
		vi.mocked(api.getBlockStatus).mockResolvedValue({ isBlocked: false });

		await useBlockedUsers.getState().refresh();

		expect(api.getBlockStatus).toHaveBeenCalledTimes(2);
		expect(api.getBlockStatus).toHaveBeenLastCalledWith("linh");
		expect(useBlockedUsers.getState().blockedIds.has("linh")).toBe(false);
	});

	it("has nothing to re-resolve before anybody was made actionable", async () => {
		await useBlockedUsers.getState().refresh();

		expect(api.getBlockStatus).not.toHaveBeenCalled();
	});
});

describe("useBlockedUsersSync", () => {
	it("applies a block made in another session, and hands back the reconnect re-resolve", async () => {
		await useBlockedUsers.getState().load("linh");
		const view = renderHook(() => useBlockedUsersSync());

		emit("block:changed", { userId: "linh", isBlocked: false });
		expect(useBlockedUsers.getState().blockedIds.has("linh")).toBe(false);

		emit("block:changed", { userId: "linh", isBlocked: true });
		expect(useBlockedUsers.getState().blockedIds.has("linh")).toBe(true);

		// The returned callback is what the page's existing reconnect handler calls,
		// for the window the socket was down and no event was delivered.
		vi.mocked(api.getBlockStatus).mockResolvedValue({ isBlocked: false });
		await act(async () => {
			await view.result.current();
		});

		expect(useBlockedUsers.getState().blockedIds.has("linh")).toBe(false);
	});
});
