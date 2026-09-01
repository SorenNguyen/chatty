import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMessageNotifications } from "@/features/chat/hooks/use-message-notifications";
import { makeConversation, makeMessage } from "./factories";

type SocketHandler = (payload: unknown) => void;
const { handlers, notificationSpy } = vi.hoisted(() => ({
	handlers: new Map<string, SocketHandler>(),
	notificationSpy: vi.fn(),
}));

vi.mock("@/features/chat/hooks/use-socket-event", () => ({
	useSocketEvent: (eventName: string, handler: SocketHandler) => handlers.set(eventName, handler),
}));
vi.mock("@/hooks/use-notification-setting", () => ({
	useNotificationSetting: () => ({ isEnabled: true }),
}));

class NotificationMock {
	static permission = "granted";

	constructor(title: string, options?: NotificationOptions) {
		notificationSpy(title, options);
	}
}

beforeEach(() => {
	handlers.clear();
	notificationSpy.mockReset();
	vi.stubGlobal("Notification", NotificationMock);
	Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
});

afterEach(() => {
	vi.unstubAllGlobals();
	Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

describe("useMessageNotifications", () => {
	it("suppresses ordinary messages from a muted conversation", () => {
		renderHook(() =>
			useMessageNotifications("minh", [makeConversation({ mutedUntil: "9999-12-31T23:59:59.999Z" })]),
		);

		handlers.get("message:new")?.(makeMessage("message-1", "an", "quiet"));

		expect(notificationSpy).not.toHaveBeenCalled();
	});

	it("lets an explicit mention override mute", () => {
		renderHook(() =>
			useMessageNotifications("minh", [makeConversation({ mutedUntil: "9999-12-31T23:59:59.999Z" })]),
		);
		const message = { ...makeMessage("message-1", "an", "@minh look"), mentionedUserIds: ["minh"] };

		handlers.get("message:new")?.(message);

		expect(notificationSpy).toHaveBeenCalledWith("an", expect.objectContaining({ body: "@minh look" }));
	});
});
