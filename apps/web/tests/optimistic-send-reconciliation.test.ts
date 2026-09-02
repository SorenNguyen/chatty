import type { MessageDTO, ServerToClientEvents } from "@chatty/shared-types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { useConversationMessages } from "@/features/chat/hooks/use-conversation-messages";
import { useAuth } from "@/hooks/use-auth";
import { makeCurrentUser, makeMessage } from "./factories";

type SocketHandler = (payload: unknown) => void;
const { socketHandlers } = vi.hoisted(() => ({ socketHandlers: new Map<string, SocketHandler>() }));

vi.mock("@/api/client", () => ({
	api: {
		listMessages: vi.fn(),
		sendMessage: vi.fn(),
		hideMessage: vi.fn(),
	},
}));
vi.mock("@/features/chat/hooks/use-socket-event", () => ({
	useSocketEvent: (eventName: string, handler: SocketHandler) => socketHandlers.set(eventName, handler),
}));
vi.mock("@/features/chat/hooks/use-message-actions", () => ({
	useMessageActions: () => ({ editMessage: vi.fn(), deleteMessage: vi.fn(), toggleReaction: vi.fn() }),
}));

function emit<EventName extends keyof ServerToClientEvents>(
	eventName: EventName,
	payload: Parameters<ServerToClientEvents[EventName]>[0],
): void {
	act(() => socketHandlers.get(eventName)?.(payload));
}

beforeEach(() => {
	socketHandlers.clear();
	vi.mocked(api.listMessages).mockReset().mockResolvedValue([]);
	vi.mocked(api.sendMessage).mockReset();
	useAuth.setState({ currentUser: makeCurrentUser() });
});

/**
 * The send path has two ways to learn that a draft became a real message — the
 * broadcast and the HTTP response — and they leave the server together. Only the
 * response used to retire the draft, so whenever the socket won the race the
 * sender's own message stood on screen twice until the response caught up.
 *
 * Both tests below deliberately settle the response *after* the event. That
 * ordering is the bug; it is also the ordering that is hardest to hit on a fast
 * machine, which is why a browser found it before any unit test did.
 */
describe("optimistic send reconciliation", () => {
	it("does not show the message twice when the broadcast beats the response", async () => {
		let settle: (message: MessageDTO) => void = () => {};
		vi.mocked(api.sendMessage).mockReturnValue(
			new Promise<MessageDTO>((resolve) => {
				settle = resolve;
			}),
		);
		const view = renderHook(() => useConversationMessages("conversation", vi.fn()));
		await waitFor(() => expect(api.listMessages).toHaveBeenCalled());

		act(() => void view.result.current.sendMessage("hello", [], null));
		await waitFor(() => expect(view.result.current.messages).toHaveLength(1));
		const draftId = view.result.current.messages[0]!.id;

		const saved: MessageDTO = {
			...makeMessage("saved", "minh", "hello"),
			conversationId: "conversation",
			clientId: draftId,
		};
		emit("message:new", saved);

		expect(view.result.current.messages).toHaveLength(1);
		expect(view.result.current.messages[0]!.id).toBe("saved");

		// And the response, arriving late, must not put a second copy back.
		await act(async () => {
			settle(saved);
			await Promise.resolve();
		});
		expect(view.result.current.messages).toHaveLength(1);
	});

	it("still appends a message from somebody else, which carries no clientId", async () => {
		const view = renderHook(() => useConversationMessages("conversation", vi.fn()));
		await waitFor(() => expect(api.listMessages).toHaveBeenCalled());

		emit("message:new", { ...makeMessage("theirs", "an", "hi"), conversationId: "conversation" });

		expect(view.result.current.messages).toHaveLength(1);
		expect(view.result.current.messages[0]!.id).toBe("theirs");
	});
});
