import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { ConversationVaultPanel } from "@/features/chat/components/conversation-vault-panel";
import { makeAttachment, makeConversation, makeParticipant } from "./factories";

vi.mock("@/api/client", () => ({
	api: {
		getConversationVaultSummary: vi.fn(),
		listConversationMedia: vi.fn(),
		listConversationLinks: vi.fn(),
		listSavedMessages: vi.fn(),
		removeSavedMessage: vi.fn(),
		listBlockedUsers: vi.fn(),
		getBlockStatus: vi.fn(),
		listRestrictedUsers: vi.fn(),
		getRestrictionStatus: vi.fn(),
	},
}));

const image = {
	...makeAttachment({ id: "photo-1", thumbUrl: "http://api.test/photo-thumb" }),
	messageId: "message-1",
	messageCreatedAt: "2026-08-12T10:00:00.000Z",
	authorName: "An",
};

beforeEach(() => {
	vi.mocked(api.getConversationVaultSummary)
		.mockReset()
		.mockResolvedValue({ media: 1, files: 0, voice: 0, links: 0, saved: 2 });
	vi.mocked(api.listConversationMedia)
		.mockReset()
		.mockResolvedValue({ items: [image], hasMore: false });
	vi.mocked(api.listConversationLinks).mockReset().mockResolvedValue({ items: [], hasMore: false });
	vi.mocked(api.listSavedMessages).mockReset().mockResolvedValue({ results: [], hasMore: false });
	vi.mocked(api.removeSavedMessage).mockReset().mockResolvedValue(undefined);
	// Block and restriction state are looked up only when a person is
	// actionable, not for every row.
	vi.mocked(api.getBlockStatus).mockReset().mockResolvedValue({ isBlocked: false });
	vi.mocked(api.getRestrictionStatus).mockReset().mockResolvedValue({ isRestricted: false });
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
			onlineUserIds={new Set(["an"])}
			onClose={vi.fn()}
			onOpenMessage={onOpenMessage}
		/>,
	);

	return onOpenMessage;
}

describe("ConversationVaultPanel", () => {
	/**
	 * The counts are the reason this is a list and not a tab bar, and they have to
	 * arrive before anything is opened — that is what answers "is there anything
	 * in Files?" without a request and a spinner.
	 */
	it("opens on the categories and their counts, fetching no page yet", async () => {
		renderPanel();

		expect(await screen.findByRole("button", { name: "Media, 1" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Saved, 2" })).toBeInTheDocument();
		expect(api.listConversationMedia).not.toHaveBeenCalled();
	});

	it("groups media by month and opens the loaded set in the shared lightbox", async () => {
		const user = userEvent.setup();
		const onOpenMessage = renderPanel();

		await user.click(await screen.findByRole("button", { name: "Media, 1" }));

		expect(await screen.findByText("August 2026")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Shared by An" }));
		expect(screen.getByRole("dialog", { name: "Image preview" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "View in conversation" }));
		expect(onOpenMessage).toHaveBeenCalledWith("message-1");
	});

	it("scopes saved messages to this conversation rather than filtering a page of them", async () => {
		const user = userEvent.setup();
		renderPanel();

		await user.click(await screen.findByRole("button", { name: "Saved, 2" }));

		expect(api.listSavedMessages).toHaveBeenCalledWith(40, undefined, "conversation-1");
	});

	/**
	 * Every other dismissible surface in this feature closes on a press outside
	 * it, and this one — the largest of them, sitting over the conversation —
	 * used to be the exception: the X or Escape, or nothing.
	 */
	it("closes on a press outside it, and not on one inside", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(
			<>
				<button type="button">somewhere else</button>
				<ConversationVaultPanel
					conversation={makeConversation({
						participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
					})}
					currentUserId="minh"
					onlineUserIds={new Set()}
					onClose={onClose}
					onOpenMessage={vi.fn()}
				/>
			</>,
		);

		await user.click(await screen.findByRole("button", { name: "Media, 1" }));
		expect(onClose).not.toHaveBeenCalled();

		await user.click(screen.getByRole("button", { name: "somewhere else" }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	/**
	 * The header button that opens this panel is labelled "Group members" for a
	 * group, so that is what a group has to land on. The categories are one Back
	 * away rather than one tap in front.
	 */
	it("lands a group on its members, with the categories one step back", async () => {
		const user = userEvent.setup();
		renderPanel({ isGroup: true });

		expect(await screen.findByText("Group name")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Back to conversation details" }));

		expect(screen.getByRole("button", { name: "Members, 2" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Media, 1" })).toBeInTheDocument();
	});
});
