import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupMembersPanel } from "@/features/chat/components/group-members-panel";
import { makeConversation, makeParticipant, makeUser } from "./factories";

const searchUsers = vi.fn();
const addParticipant = vi.fn();
const removeParticipant = vi.fn();
const renameConversation = vi.fn();

vi.mock("@/api/client", () => ({
	api: {
		searchUsers: (query: string) => searchUsers(query),
		addParticipant: (conversationId: string, userId: string) => addParticipant(conversationId, userId),
		removeParticipant: (conversationId: string, userId: string) => removeParticipant(conversationId, userId),
		renameConversation: (conversationId: string, name: string) => renameConversation(conversationId, name),
	},
}));

const minh = makeParticipant("minh", "Minh");
const an = makeParticipant("an", "An");
const binh = makeParticipant("binh", "Binh");

const group = makeConversation({
	id: "group-1",
	isGroup: true,
	name: "Weekend football",
	participants: [minh, an, binh],
});

beforeEach(() => {
	searchUsers.mockReset().mockResolvedValue([]);
	addParticipant.mockReset().mockResolvedValue(group);
	removeParticipant.mockReset().mockResolvedValue(undefined);
	renameConversation.mockReset().mockResolvedValue(group);
});

describe("GroupMembersPanel", () => {
	it("lists every participant, marking the current user's own row", () => {
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		// "(you)" renders in its own nested <span>, so it is a separate text node
		// from the name rather than part of one combined string.
		expect(screen.getByText("Minh")).toBeInTheDocument();
		expect(screen.getByText("(you)")).toBeInTheDocument();
		expect(screen.getByText("An")).toBeInTheDocument();
		expect(screen.getByText("Binh")).toBeInTheDocument();
	});

	it("shows no remove button on your own row", () => {
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		// A misclick here would kick yourself; "Leave group" is the deliberate
		// action for that instead.
		expect(screen.queryByRole("button", { name: "Remove Minh from the group" })).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Remove An from the group" })).toBeInTheDocument();
	});

	it("removes another member when their remove button is clicked", async () => {
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Remove An from the group" }));

		expect(removeParticipant).toHaveBeenCalledWith("group-1", "an");
	});

	it('leaves the group when "Leave group" is clicked', async () => {
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Leave group" }));

		expect(removeParticipant).toHaveBeenCalledWith("group-1", "minh");
	});

	it("renames the group with the trimmed input", async () => {
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		const nameField = screen.getByLabelText("Group name");
		await user.clear(nameField);
		await user.type(nameField, "  Sunday football  ");
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(renameConversation).toHaveBeenCalledWith("group-1", "Sunday football");
	});

	it("disables Save when the draft matches the current name", () => {
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
	});

	it("excludes current participants from add-member search results", async () => {
		// "An" is already in the group; offering to add them again is meaningless
		// and the server would reject it as a conflict.
		searchUsers.mockResolvedValue([makeUser("an", "An"), makeUser("chi", "Chi")]);
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.type(screen.getByLabelText("Add a member"), "a{Enter}");

		expect(await screen.findByRole("button", { name: "Add Chi @chi" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Add An/ })).not.toBeInTheDocument();
	});

	it("adds a member from the search results and clears the search", async () => {
		searchUsers.mockResolvedValue([makeUser("chi", "Chi")]);
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.type(screen.getByLabelText("Add a member"), "chi{Enter}");
		await user.click(await screen.findByRole("button", { name: "Add Chi @chi" }));

		expect(addParticipant).toHaveBeenCalledWith("group-1", "chi");
		expect(screen.queryByRole("button", { name: "Add Chi @chi" })).not.toBeInTheDocument();
	});

	it("surfaces a failed removal instead of failing silently", async () => {
		removeParticipant.mockRejectedValue(new Error("Network is down"));
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Remove An from the group" }));

		expect(await screen.findByText("Network is down")).toBeInTheDocument();
	});

	it("calls onClose when the close button is clicked", async () => {
		const onClose = vi.fn();
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={onClose} />);

		await user.click(screen.getByRole("button", { name: "Close group settings" }));

		expect(onClose).toHaveBeenCalledOnce();
	});
});
