import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageList } from "@/features/chat/components/message-list";
import { makeMessage, makeParticipant, makeSystemMessage } from "./factories";

const messages = [makeMessage("m1", "minh", "first"), makeMessage("m2", "an", "second")];

function renderList(overrides: Partial<React.ComponentProps<typeof MessageList>> = {}) {
	const props = {
		messages,
		currentUserId: "minh",
		participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
		isGroup: false,
		hasMoreOlder: false,
		isLoadingOlder: false,
		onLoadOlder: vi.fn(),
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

	it("renders a group event as a line of its own", () => {
		renderList({ messages: [makeSystemMessage("s1", "An added Binh")], isGroup: true });

		expect(screen.getByText("An added Binh")).toBeInTheDocument();
		// No bubble, because it is not from anyone: a system line sits centred
		// between the two columns rather than on one side of them.
		expect(document.querySelector(".rounded-2xl")).toBeNull();
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
});
