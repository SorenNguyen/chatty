import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { MessageSearchPanel } from "@/features/chat/components/message-search-panel";
import { makeMessage, makeUser } from "./factories";

const result = (id: string, content: string, conversationId = "c1", overrides = {}) => ({
	message: { ...makeMessage(id, "an", content), conversationId },
	conversation: {
		id: conversationId,
		isGroup: false,
		name: null,
		participants: [makeUser("minh", "Minh"), makeUser("an", "An")],
		...overrides,
	},
});

let search: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	search = vi.spyOn(api, "searchMessages").mockResolvedValue([]);
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function renderPanel(onSelectResult = vi.fn()) {
	render(<MessageSearchPanel currentUserId="minh" onSelectResult={onSelectResult} />);

	return { onSelectResult, box: screen.getByLabelText("Search messages") };
}

describe("MessageSearchPanel", () => {
	it("does not search for a single character", async () => {
		// The server refuses it too. One character matches a large share of every
		// message ever sent, so the request is expensive and the answer useless.
		const { box } = renderPanel();

		await userEvent.type(box, "a");
		await vi.advanceTimersByTimeAsync(500);

		expect(search).not.toHaveBeenCalled();
	});

	it("searches once for a word rather than once per keystroke", async () => {
		// The debounce, and the reason for it: this hits a full-text index.
		const { box } = renderPanel();

		await userEvent.type(box, "deploy");
		await vi.advanceTimersByTimeAsync(500);

		await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
		expect(search).toHaveBeenCalledWith("deploy");
	});

	it("shows what matched, and who said it", async () => {
		// A result is read out of context, so the author is half of what
		// identifies it — even in a direct conversation.
		search.mockResolvedValue([result("m1", "the deployment is on Friday")]);
		const { box } = renderPanel();

		await userEvent.type(box, "deployment");
		await vi.advanceTimersByTimeAsync(500);

		expect(await screen.findByText(/an: the deployment is on Friday/i)).toBeInTheDocument();
	});

	it("titles a direct conversation by the other person", async () => {
		search.mockResolvedValue([result("m1", "hello")]);
		const { box } = renderPanel();

		await userEvent.type(box, "hello");
		await vi.advanceTimersByTimeAsync(500);

		expect(await screen.findByText("An")).toBeInTheDocument();
	});

	it("titles a group by its name", async () => {
		search.mockResolvedValue([result("m1", "hello", "c1", { isGroup: true, name: "Standup" })]);
		const { box } = renderPanel();

		await userEvent.type(box, "hello");
		await vi.advanceTimersByTimeAsync(500);

		expect(await screen.findByText("Standup")).toBeInTheDocument();
	});

	it("opens the conversation a result came from", async () => {
		search.mockResolvedValue([result("m1", "hello", "conversation-7")]);
		const { onSelectResult, box } = renderPanel();

		await userEvent.type(box, "hello");
		await vi.advanceTimersByTimeAsync(500);
		await userEvent.click(await screen.findByRole("button", { name: /an: hello/i }));

		expect(onSelectResult).toHaveBeenCalledWith("conversation-7");
	});

	it("says so when nothing matched", async () => {
		const { box } = renderPanel();

		await userEvent.type(box, "nothing");
		await vi.advanceTimersByTimeAsync(500);

		expect(await screen.findByText(/no messages match/i)).toBeInTheDocument();
	});

	it("clears the results when the box is emptied", async () => {
		// Not merely tidy: results left under a query that no longer produced them
		// are results the reader will believe.
		search.mockResolvedValue([result("m1", "the deployment is on Friday")]);
		const { box } = renderPanel();
		await userEvent.type(box, "deployment");
		await vi.advanceTimersByTimeAsync(500);
		expect(await screen.findByText(/an: the deployment/i)).toBeInTheDocument();

		await userEvent.clear(box);
		await vi.advanceTimersByTimeAsync(500);

		await waitFor(() => expect(screen.queryByText(/an: the deployment/i)).not.toBeInTheDocument());
	});

	it("reports a failed search rather than showing nothing", async () => {
		search.mockRejectedValue(new Error("search is unavailable"));
		const { box } = renderPanel();

		await userEvent.type(box, "deployment");
		await vi.advanceTimersByTimeAsync(500);

		expect(await screen.findByText("search is unavailable")).toBeInTheDocument();
	});
});
