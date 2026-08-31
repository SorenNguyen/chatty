import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { MessageList } from "@/features/chat/components/message-list";
import { makeAttachment, makeMessage, makeOrphanedMessage, makeParticipant, makeSystemMessage } from "./factories";

const messages = [makeMessage("m1", "minh", "first"), makeMessage("m2", "an", "second")];

/**
 * Any moment in the past. Nothing here renders these — the list branches on
 * whether they are set, not on what they say — so a fixed value keeps the tests
 * about the branch rather than about formatting.
 */
const FIXED_EDITED_AT = "2026-08-23T10:05:00.000Z";
const FIXED_DELETED_AT = "2026-08-23T10:06:00.000Z";

afterEach(() => vi.restoreAllMocks());

function renderList(overrides: Partial<React.ComponentProps<typeof MessageList>> = {}) {
	const props = {
		messages,
		currentUserId: "minh",
		participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
		isGroup: false,
		areReceiptsShared: true,
		isLoadingThread: false,
		hasMoreOlder: false,
		isLoadingOlder: false,
		onLoadOlder: vi.fn(),
		hasMoreNewer: false,
		isLoadingNewer: false,
		onLoadNewer: vi.fn(),
		onEditMessage: vi.fn(),
		onDeleteMessage: vi.fn(),
		onHideMessage: vi.fn(),
		onRetrySend: vi.fn(),
		onDiscardDraft: vi.fn(),
		onToggleReaction: vi.fn(),
		onReplyToMessage: vi.fn(),
		...overrides,
	};

	render(<MessageList {...props} />);

	return props;
}

/**
 * The scroll container, found by class rather than by role.
 *
 * Queries here normally go through roles and labels, but a scroll viewport is
 * layout with no accessible name to ask for — there is nothing better to match on.
 */
function getScrollContainer(): HTMLElement {
	const container = document.querySelector<HTMLElement>(".overflow-y-auto");
	if (!container) throw new Error("scroll container not found");

	return container;
}

describe("MessageList", () => {
	it("renders every message", () => {
		renderList();

		expect(screen.getByText("first")).toBeInTheDocument();
		expect(screen.getByText("second")).toBeInTheDocument();
	});

	it("keeps a reaction inside the author's message run", () => {
		renderList({
			messages: [
				makeMessage("m1", "an", "first", [], {
					reactions: [{ kind: "heart", userIds: ["minh"] }],
				}),
				makeMessage("m2", "an", "second"),
			],
			isGroup: true,
		});

		expect(screen.getAllByText("an")).toHaveLength(1);
	});

	it("marks the time when a conversation resumes after a long pause", () => {
		renderList({
			messages: [
				makeMessage("m1", "an", "morning", [], { createdAt: "2026-08-23T08:00:00.000Z" }),
				makeMessage("m2", "an", "back now", [], { createdAt: "2026-08-23T10:00:00.000Z" }),
			],
		});

		expect(screen.getByLabelText(/Conversation resumed at/i)).toBeInTheDocument();
	});

	it("keeps the name of an author who is no longer in the conversation", () => {
		// The bug this replaced: the author was resolved against `participants`,
		// so every message written by someone who had left the group lost its
		// name and its avatar. The history stayed and the person vanished from it.
		renderList({
			messages: [makeMessage("m1", "chi", "see you all")],
			participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
			isGroup: true,
		});

		expect(screen.getByText("see you all")).toBeInTheDocument();
		expect(screen.getByText("chi")).toBeInTheDocument();
	});

	it("names authors in a group that has shrunk to two people", () => {
		// `isGroup` used to be `participants.length > 2`, which turned a group into
		// a 1-1 the moment someone left — dropping the names from exactly the
		// messages that needed them most.
		renderList({
			messages: [makeMessage("m1", "an", "still here")],
			participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
			isGroup: true,
		});

		expect(screen.getByText("an")).toBeInTheDocument();
	});

	it("names a message whose author deleted their account rather than dropping the label", () => {
		// The message survives the account — deleting it would empty half of other
		// people's conversations — but the name does not. Without this it would
		// render as an anonymous bubble with no indication whose it was.
		renderList({
			messages: [makeOrphanedMessage("m1", "written before they left")],
			participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
			isGroup: true,
		});

		expect(screen.getByText("written before they left")).toBeInTheDocument();
		expect(screen.getByText("Deleted account")).toBeInTheDocument();
		// Still a message, unlike a system line: somebody said this, so it carries
		// the actions menu a system line has nothing to put in.
		//
		// This used to assert on a `.rounded-2xl` class, which is the one thing the
		// conventions here say not to query by. It broke the first time the bubble's
		// radius changed and had never said anything about behaviour.
		expect(screen.getByRole("button", { name: "Message actions" })).toBeInTheDocument();
	});

	it("renders a group event as a line of its own", () => {
		renderList({ messages: [makeSystemMessage("s1", "An added Binh")], isGroup: true });

		expect(screen.getByText("An added Binh")).toBeInTheDocument();
		// Nobody wrote it, so there is nothing to edit, unsend or hide — and so no
		// actions menu, which is what tells it apart from a message in the DOM.
		expect(screen.queryByRole("button", { name: "Message actions" })).not.toBeInTheDocument();
	});

	it("shows an empty state when there are no messages", () => {
		renderList({ messages: [] });

		expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
	});

	it("marks the start of history only when nothing older remains", () => {
		renderList({ hasMoreOlder: false });

		expect(screen.getByText(/beginning of the conversation/i)).toBeInTheDocument();
	});

	it("does not claim the start of history while older messages exist", () => {
		renderList({ hasMoreOlder: true });

		expect(screen.queryByText(/beginning of the conversation/i)).not.toBeInTheDocument();
	});

	it("shows a loading note while older messages are being fetched", () => {
		renderList({ hasMoreOlder: true, isLoadingOlder: true });

		expect(screen.getByText(/loading earlier messages/i)).toBeInTheDocument();
	});

	it("asks for older messages when the reader scrolls near the top", () => {
		const { onLoadOlder } = renderList({ hasMoreOlder: true });

		fireEvent.scroll(getScrollContainer(), { target: { scrollTop: 0 } });

		expect(onLoadOlder).toHaveBeenCalledOnce();
	});

	it("does not ask again while a page is already loading", () => {
		// Otherwise a few scroll events fire several overlapping requests and the
		// same page gets prepended more than once.
		const { onLoadOlder } = renderList({ hasMoreOlder: true, isLoadingOlder: true });

		fireEvent.scroll(getScrollContainer(), { target: { scrollTop: 0 } });

		expect(onLoadOlder).not.toHaveBeenCalled();
	});

	it("does not ask when there is nothing older to fetch", () => {
		const { onLoadOlder } = renderList({ hasMoreOlder: false });

		fireEvent.scroll(getScrollContainer(), { target: { scrollTop: 0 } });

		expect(onLoadOlder).not.toHaveBeenCalled();
	});

	it("does not ask when the reader is far from the top", () => {
		const { onLoadOlder } = renderList({ hasMoreOlder: true });

		fireEvent.scroll(getScrollContainer(), { target: { scrollTop: 5000 } });

		expect(onLoadOlder).not.toHaveBeenCalled();
	});

	it("renders one newer-page control for the list, not one per message", () => {
		renderList({ hasMoreNewer: true });

		expect(screen.getAllByRole("button", { name: "Load newer messages" })).toHaveLength(1);
	});
});

describe("MessageList editing and deleting", () => {
	const mine = makeMessage("m1", "minh", "mine");
	const theirs = makeMessage("m2", "an", "theirs");

	function openMessageActions() {
		fireEvent.click(screen.getByLabelText("Message actions"));
	}

	it("offers edit and delete on your own message", () => {
		renderList({ messages: [mine] });
		openMessageActions();

		expect(screen.getByRole("menuitem", { name: "Edit message" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Delete message" })).toBeInTheDocument();
	});

	it("offers delete-for-me but not editing on someone else's", () => {
		renderList({ messages: [theirs] });
		openMessageActions();

		expect(screen.queryByLabelText("Edit message")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete message" }));
		expect(screen.getByRole("menuitem", { name: "Delete for me" })).toBeInTheDocument();
		expect(screen.queryByRole("menuitem", { name: "Delete for everyone" })).not.toBeInTheDocument();
	});

	it("allows a tombstone to be removed for the current user", () => {
		const { onHideMessage } = renderList({
			messages: [makeMessage("m1", "minh", "", [], { deletedAt: FIXED_DELETED_AT })],
		});
		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete message" }));

		expect(screen.queryByLabelText("Edit message")).not.toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Delete for me" })).toBeInTheDocument();
		expect(screen.queryByRole("menuitem", { name: "Delete for everyone" })).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete for me" }));
		expect(onHideMessage).toHaveBeenCalledWith("m1");
	});

	it("hides author-only actions after their 8-hour deadline", () => {
		renderList({
			messages: [makeMessage("m1", "minh", "old", [], { authorActionExpiresAt: "2000-01-01T00:00:00.000Z" })],
		});
		openMessageActions();

		expect(screen.queryByLabelText("Edit message")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete message" }));
		expect(screen.getByRole("menuitem", { name: "Delete for me" })).toBeInTheDocument();
		expect(screen.queryByRole("menuitem", { name: "Delete for everyone" })).not.toBeInTheDocument();
	});

	it("reports the new text once the author saves", () => {
		const { onEditMessage } = renderList({ messages: [mine] });

		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Edit message" }));
		fireEvent.change(screen.getByLabelText("Edit message"), { target: { value: "mine, fixed" } });
		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		expect(onEditMessage).toHaveBeenCalledWith("m1", "mine, fixed");
	});

	it("does not report an edit that changes nothing", () => {
		// Otherwise opening the editor and pressing Save writes an "edited" marker
		// onto a message nobody actually changed.
		const { onEditMessage } = renderList({ messages: [mine] });

		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Edit message" }));

		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		expect(onEditMessage).not.toHaveBeenCalled();
	});

	it("does not let a text-only message be emptied", () => {
		const { onEditMessage } = renderList({ messages: [mine] });

		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Edit message" }));
		fireEvent.change(screen.getByLabelText("Edit message"), { target: { value: "   " } });

		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		expect(onEditMessage).not.toHaveBeenCalled();
	});

	it("lets the caption of a message with an image be cleared", () => {
		const { onEditMessage } = renderList({
			messages: [makeMessage("m1", "minh", "look", [makeAttachment()])],
		});

		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Edit message" }));
		fireEvent.change(screen.getByLabelText("Edit message"), { target: { value: "" } });
		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		expect(onEditMessage).toHaveBeenCalledWith("m1", "");
	});

	it("abandons the edit on cancel", () => {
		const { onEditMessage } = renderList({ messages: [mine] });

		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Edit message" }));
		fireEvent.change(screen.getByLabelText("Edit message"), { target: { value: "never mind" } });
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		expect(onEditMessage).not.toHaveBeenCalled();
		expect(screen.getByText("mine")).toBeInTheDocument();
	});

	it("asks before deleting", () => {
		// The only destructive action in the app that confirms, because it is the
		// only one nobody can undo — the server empties the row and removes the file.
		const { onDeleteMessage } = renderList({ messages: [mine] });

		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete message" }));

		expect(onDeleteMessage).not.toHaveBeenCalled();
		expect(screen.getByRole("menuitem", { name: "Delete for everyone" })).toBeInTheDocument();
	});

	it("deletes once the author confirms", () => {
		const { onDeleteMessage } = renderList({ messages: [mine] });

		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete message" }));
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete for everyone" }));

		expect(onDeleteMessage).toHaveBeenCalledWith("m1");
	});

	it("keeps the message when the author backs out", () => {
		const { onDeleteMessage } = renderList({ messages: [mine] });

		openMessageActions();
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete message" }));
		fireEvent.click(screen.getByRole("menuitem", { name: "Cancel" }));

		expect(onDeleteMessage).not.toHaveBeenCalled();
		expect(screen.getByRole("menuitem", { name: "Delete message" })).toBeInTheDocument();
	});

	it("stands a placeholder in for a deleted message", () => {
		renderList({ messages: [makeMessage("m1", "minh", "", [], { deletedAt: FIXED_DELETED_AT })] });

		expect(screen.getByText("This message was deleted")).toBeInTheDocument();
	});

	it("renders nothing of a deleted message's image", () => {
		// The server drops the attachment on delete, so this is belt and braces —
		// and the one thing a client must never render from a stale copy.
		renderList({
			messages: [makeMessage("m1", "minh", "", [makeAttachment()], { deletedAt: FIXED_DELETED_AT })],
		});

		expect(screen.queryByRole("img")).not.toBeInTheDocument();
	});

	it("marks a message its author rewrote", () => {
		renderList({ messages: [makeMessage("m1", "minh", "fixed", [], { editedAt: FIXED_EDITED_AT })] });

		expect(screen.getByText(/edited/)).toBeInTheDocument();
	});

	it("opens exactly one accessible edit-history dialog and closes it with Escape", async () => {
		vi.spyOn(api, "listMessageEdits").mockResolvedValue([
			{ id: "e1", content: "before", editedAt: FIXED_EDITED_AT },
		]);
		renderList({
			messages: [
				makeMessage("m1", "minh", "first fixed", [], { editedAt: FIXED_EDITED_AT }),
				makeMessage("m2", "an", "second fixed", [], { editedAt: FIXED_EDITED_AT }),
			],
		});

		fireEvent.click(screen.getAllByText(/edited/)[0]!);
		await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
		expect(await screen.findByText("before")).toBeInTheDocument();
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("does not mark a message nobody touched", () => {
		renderList({ messages: [mine] });

		expect(screen.queryByText(/edited/)).not.toBeInTheDocument();
	});

	it("does not call a deleted message edited, even if it was", () => {
		// Both timestamps can be set: edit it, then delete it. "Edited" beside
		// "This message was deleted" describes text nobody can read either way.
		renderList({
			messages: [makeMessage("m1", "minh", "", [], { editedAt: FIXED_EDITED_AT, deletedAt: FIXED_DELETED_AT })],
		});

		expect(screen.queryByText(/edited/)).not.toBeInTheDocument();
	});
});
