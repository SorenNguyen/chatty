import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageList } from "@/features/chat/components/message-list";
import { makeMessage, makeParticipant } from "./factories";

const messages = [makeMessage("m1", "minh", "first"), makeMessage("m2", "an", "second")];

function renderList(overrides: Partial<React.ComponentProps<typeof MessageList>> = {}) {
	const props = {
		messages,
		currentUserId: "minh",
		participants: [makeParticipant("minh", "Minh"), makeParticipant("an", "An")],
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
