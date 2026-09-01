import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { ConversationActions } from "@/features/chat/components/conversation-actions";
import { makeConversation } from "./factories";

const UPDATED_CONVERSATION = {
	conversationId: "conversation-1",
	isPinned: false,
	isArchived: false,
	mutedUntil: null,
};

vi.mock("@/api/client", () => ({
	api: {
		setConversationArchived: vi.fn(),
		setConversationPinned: vi.fn(),
		setConversationMuted: vi.fn(),
	},
}));

beforeEach(() => {
	vi.mocked(api.setConversationArchived).mockReset().mockResolvedValue(UPDATED_CONVERSATION);
	vi.mocked(api.setConversationPinned).mockReset().mockResolvedValue(UPDATED_CONVERSATION);
	vi.mocked(api.setConversationMuted).mockReset().mockResolvedValue(UPDATED_CONVERSATION);
});

describe("ConversationActions", () => {
	it("keeps row actions behind one compact trigger", async () => {
		render(<ConversationActions conversation={makeConversation()} />);

		expect(screen.getByRole("button", { name: "Conversation actions" })).toBeInTheDocument();
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		expect(document.querySelector("select")).not.toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: "Conversation actions" }));

		expect(screen.getByRole("menuitem", { name: "Pin conversation" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Archive" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Mute" })).toBeInTheDocument();
	});

	it("uses an in-app mute submenu instead of a native dropdown", async () => {
		const user = userEvent.setup();
		render(<ConversationActions conversation={makeConversation()} />);

		await user.click(screen.getByRole("button", { name: "Conversation actions" }));
		await user.click(screen.getByRole("menuitem", { name: "Mute" }));

		expect(screen.getByRole("menuitem", { name: "8 hours" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "1 week" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Forever" })).toBeInTheDocument();
		expect(document.querySelector("select")).not.toBeInTheDocument();

		await user.click(screen.getByRole("menuitem", { name: "8 hours" }));
		expect(api.setConversationMuted).toHaveBeenCalledWith(
			"conversation-1",
			expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
		);
	});

	it("shows the inverse actions for an organised conversation", async () => {
		render(
			<ConversationActions
				conversation={makeConversation({
					isPinned: true,
					isArchived: true,
					mutedUntil: "9999-12-31T23:59:59.999Z",
				})}
			/>,
		);

		await userEvent.click(screen.getByRole("button", { name: "Conversation actions" }));

		expect(screen.getByRole("menuitem", { name: "Unpin" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Unarchive" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Muted" })).toBeInTheDocument();
	});
});
