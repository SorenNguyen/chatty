import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { ConversationVaultPanel } from "@/features/chat/components/conversation-vault-panel";
import { makeAttachment, makeConversation, makeParticipant } from "./factories";

vi.mock("@/api/client", () => ({
	api: {
		listConversationMedia: vi.fn(),
		listConversationLinks: vi.fn(),
		listSavedMessages: vi.fn(),
		removeSavedMessage: vi.fn(),
	},
}));

const image = {
	...makeAttachment({ id: "photo-1", thumbUrl: "http://api.test/photo-thumb" }),
	messageId: "message-1",
	messageCreatedAt: "2026-08-12T10:00:00.000Z",
	authorName: "An",
};

beforeEach(() => {
	vi.mocked(api.listConversationMedia)
		.mockReset()
		.mockResolvedValue({ items: [image], hasMore: false });
	vi.mocked(api.listConversationLinks).mockReset().mockResolvedValue({ items: [], hasMore: false });
	vi.mocked(api.listSavedMessages).mockReset().mockResolvedValue({ results: [], hasMore: false });
	vi.mocked(api.removeSavedMessage).mockReset().mockResolvedValue(undefined);
});

function renderPanel(overrides: { isGroup?: boolean } = {}) {
	const onOpenMessage = vi.fn();
	render(
		<ConversationVaultPanel
			conversation={makeConversation({
				isGroup: overrides.isGroup ?? false,
				name: overrides.isGroup ? "Team" : null,
				participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
			})}
			currentUserId="minh"
			onClose={vi.fn()}
			onOpenMessage={onOpenMessage}
		/>,
	);

	return onOpenMessage;
}

describe("ConversationVaultPanel", () => {
	it("groups media by month and opens the loaded set in the shared lightbox", async () => {
		const user = userEvent.setup();
		const onOpenMessage = renderPanel();

		expect(await screen.findByText("August 2026")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Shared by An" }));

		expect(screen.getByRole("dialog", { name: "Image preview" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "View in conversation" }));
		expect(onOpenMessage).toHaveBeenCalledWith("message-1");
	});

	it("keeps the shared tab bar available while managing group members", async () => {
		const user = userEvent.setup();
		renderPanel({ isGroup: true });

		await user.click(screen.getByRole("button", { name: "Members" }));

		expect(screen.getByText("Group name")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Media" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Files" })).toBeInTheDocument();
	});
});
