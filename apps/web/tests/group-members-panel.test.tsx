import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupMembersPanel } from "@/features/chat/components/group-members-panel";
import { makeConversation, makeParticipant, makeUser } from "./factories";

const searchUsers = vi.fn();
const addParticipant = vi.fn();
const removeParticipant = vi.fn();
const renameConversation = vi.fn();
const transferOwnership = vi.fn();
const setParticipantRole = vi.fn();
const setGroupInvitePolicy = vi.fn();

vi.mock("@/api/client", () => ({
	api: {
		searchUsers: (query: string) => searchUsers(query),
		addParticipant: (conversationId: string, userId: string) => addParticipant(conversationId, userId),
		removeParticipant: (conversationId: string, userId: string) => removeParticipant(conversationId, userId),
		renameConversation: (conversationId: string, name: string) => renameConversation(conversationId, name),
		transferOwnership: (conversationId: string, userId: string) => transferOwnership(conversationId, userId),
		setParticipantRole: (conversationId: string, userId: string, role: string) =>
			setParticipantRole(conversationId, userId, role),
		setGroupInvitePolicy: (conversationId: string, policy: string) => setGroupInvitePolicy(conversationId, policy),
	},
}));

// Minh owns the group in these fixtures, because the owner is who most of this
// panel is for: the rename field and the remove buttons are theirs alone. A
// member's view of the same panel gets its own test at the bottom.
const minh = makeParticipant("minh", "Minh", null, "owner");
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
	transferOwnership.mockReset().mockResolvedValue(group);
	setParticipantRole.mockReset().mockResolvedValue(group);
	setGroupInvitePolicy.mockReset().mockResolvedValue(group);
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

	it("removes another member once the removal is confirmed", async () => {
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Remove An from the group" }));
		await user.click(screen.getByRole("button", { name: "Remove" }));

		expect(removeParticipant).toHaveBeenCalledWith("group-1", "an");
	});

	it("does not remove anyone when the dialog is cancelled", async () => {
		// The dialog is the whole point of the change: a mis-click on a small icon
		// beside somebody's name used to take them out of the group immediately.
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Remove An from the group" }));
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(removeParticipant).not.toHaveBeenCalled();
	});

	it("hands the group to another member", async () => {
		const typist = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await typist.click(screen.getByRole("button", { name: "Make An the group owner" }));

		expect(transferOwnership).toHaveBeenCalledWith("group-1", "an");
		// No hand-over button on your own row: you are already the owner, and the
		// server refuses it anyway.
		expect(screen.queryByRole("button", { name: "Make Minh the group owner" })).not.toBeInTheDocument();
	});

	it("promotes an ordinary member to admin", async () => {
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Make An an admin" }));

		expect(setParticipantRole).toHaveBeenCalledWith("group-1", "an", "admin");
	});

	it("lets the owner restrict invitations to managers", async () => {
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.selectOptions(screen.getByLabelText("Who can add people"), "managers");

		expect(setGroupInvitePolicy).toHaveBeenCalledWith("group-1", "managers");
	});

	it("leaves the group once leaving is confirmed", async () => {
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="minh" onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Leave group" }));
		await user.click(screen.getByRole("button", { name: "Leave" }));

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
		await user.click(screen.getByRole("button", { name: "Remove" }));

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

describe("GroupMembersPanel, seen by a member who does not own the group", () => {
	it("offers no way to remove anyone, and no way to hand the group on", () => {
		render(<GroupMembersPanel conversation={group} currentUserId="an" onClose={vi.fn()} />);

		expect(screen.queryByRole("button", { name: "Remove Binh from the group" })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Remove Minh from the group" })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Make Binh the group owner" })).not.toBeInTheDocument();
	});

	it("locks the name field and says who can change it", () => {
		// A disabled control with no explanation reads as a bug rather than a rule.
		render(<GroupMembersPanel conversation={group} currentUserId="an" onClose={vi.fn()} />);

		expect(screen.getByLabelText("Group name")).toBeDisabled();
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		expect(screen.getByText(/only group owners and admins can rename/i)).toBeInTheDocument();
	});

	it("still lets them invite someone", async () => {
		// Adding is deliberately not owner-only — see ADR 0008.
		searchUsers.mockResolvedValue([makeUser("chi", "Chi")]);
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="an" onClose={vi.fn()} />);

		await user.type(screen.getByLabelText("Add a member"), "chi{Enter}");
		await user.click(await screen.findByRole("button", { name: "Add Chi @chi" }));

		expect(addParticipant).toHaveBeenCalledWith("group-1", "chi");
	});

	it("still lets them leave", async () => {
		const user = userEvent.setup();
		render(<GroupMembersPanel conversation={group} currentUserId="an" onClose={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "Leave group" }));
		await user.click(screen.getByRole("button", { name: "Leave" }));

		expect(removeParticipant).toHaveBeenCalledWith("group-1", "an");
	});

	it("marks the owner's row so it is clear who to ask", () => {
		render(<GroupMembersPanel conversation={group} currentUserId="an" onClose={vi.fn()} />);

		expect(screen.getByText("Owner")).toBeInTheDocument();
	});

	it("hides add-member search when the owner chose manager-only invites", () => {
		render(
			<GroupMembersPanel
				conversation={{ ...group, invitePolicy: "managers" }}
				currentUserId="an"
				onClose={vi.fn()}
			/>,
		);

		expect(screen.queryByLabelText("Add a member")).not.toBeInTheDocument();
		expect(screen.getByText(/only owners and admins add people/i)).toBeInTheDocument();
	});
});

describe("GroupMembersPanel, seen by an admin", () => {
	it("can rename, invite under manager policy, and remove an ordinary member", () => {
		const adminGroup = {
			...group,
			invitePolicy: "managers" as const,
			participants: [minh, { ...an, role: "admin" as const }, binh],
		};
		render(<GroupMembersPanel conversation={adminGroup} currentUserId="an" onClose={vi.fn()} />);

		expect(screen.getByLabelText("Group name")).toBeEnabled();
		expect(screen.getByLabelText("Add a member")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Remove Binh from the group" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Remove Minh from the group" })).not.toBeInTheDocument();
		expect(screen.getByText("Admin")).toBeInTheDocument();
	});
});
