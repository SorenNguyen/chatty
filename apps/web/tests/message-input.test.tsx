import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageInput } from "@/features/chat/components/message-input";

const sendMessage = vi.fn();

vi.mock("@/api/client", () => ({
	api: {
		sendMessage: (conversationId: string, content: string, attachment?: File) =>
			sendMessage(conversationId, content, attachment),
	},
}));

// The typing notifier talks to a socket, which is not what these tests are about.
vi.mock("@/features/chat/hooks", () => ({
	useTypingNotifier: () => ({ notifyTyping: vi.fn(), stopTyping: vi.fn() }),
}));

beforeEach(() => {
	sendMessage.mockReset().mockResolvedValue(undefined);
	// jsdom has no object URL implementation; the preview needs one.
	URL.createObjectURL = vi.fn(() => "blob:preview");
	URL.revokeObjectURL = vi.fn();
});

/** The hidden file input, which has no label to query by. */
function fileInput(container: HTMLElement): HTMLInputElement {
	return container.querySelector('input[type="file"]') as HTMLInputElement;
}

/** The submit button, which is an icon and so has no accessible name of its own. */
function sendButton(): HTMLElement {
	return screen.getAllByRole("button").at(-1)!;
}

const image = new File(["pretend-bytes"], "photo.png", { type: "image/png" });

describe("MessageInput", () => {
	it("cannot send a message that is neither text nor picture", () => {
		render(<MessageInput conversationId="conversation-1" />);

		expect(sendButton()).toBeDisabled();
	});

	it("enables sending as soon as a picture is attached, with no text", async () => {
		const typist = userEvent.setup();
		const { container } = render(<MessageInput conversationId="conversation-1" />);

		await typist.upload(fileInput(container), image);

		expect(sendButton()).toBeEnabled();
	});

	it("sends text with no attachment", async () => {
		const typist = userEvent.setup();
		render(<MessageInput conversationId="conversation-1" />);

		await typist.type(screen.getByLabelText("Message"), "hello{Enter}");

		expect(sendMessage).toHaveBeenCalledWith("conversation-1", "hello", undefined);
	});

	it("lets an image be sent with no text at all", async () => {
		// The whole reason the send button's guard changed: a picture is a message.
		const typist = userEvent.setup();
		const { container } = render(<MessageInput conversationId="conversation-1" />);

		await typist.upload(fileInput(container), image);
		await typist.click(sendButton());

		expect(sendMessage).toHaveBeenCalledWith("conversation-1", "", image);
	});

	it("sends an image together with its caption", async () => {
		const typist = userEvent.setup();
		const { container } = render(<MessageInput conversationId="conversation-1" />);

		await typist.upload(fileInput(container), image);
		await typist.type(screen.getByLabelText("Message"), "look at this{Enter}");

		expect(sendMessage).toHaveBeenCalledWith("conversation-1", "look at this", image);
	});

	it("shows a preview that can be removed again", async () => {
		const typist = userEvent.setup();
		const { container } = render(<MessageInput conversationId="conversation-1" />);

		await typist.upload(fileInput(container), image);
		expect(screen.getByAltText("Attached image preview")).toBeInTheDocument();

		await typist.click(screen.getByRole("button", { name: "Remove attached image" }));

		expect(screen.queryByAltText("Attached image preview")).not.toBeInTheDocument();
	});

	it("releases the object URL when the picture is removed", async () => {
		// Otherwise the file stays in memory for the life of the tab.
		const typist = userEvent.setup();
		const { container } = render(<MessageInput conversationId="conversation-1" />);

		await typist.upload(fileInput(container), image);
		await typist.click(screen.getByRole("button", { name: "Remove attached image" }));

		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
	});

	it("clears the attachment after a successful send", async () => {
		const typist = userEvent.setup();
		const { container } = render(<MessageInput conversationId="conversation-1" />);

		await typist.upload(fileInput(container), image);
		await typist.click(sendButton());

		expect(await screen.findByLabelText("Message")).toHaveValue("");
		expect(screen.queryByAltText("Attached image preview")).not.toBeInTheDocument();
	});

	it("keeps the attachment when the send fails", async () => {
		// Re-picking a photo after a dropped connection is the most annoying
		// possible way to lose it.
		sendMessage.mockRejectedValue(new Error("Network is down"));
		const typist = userEvent.setup();
		const { container } = render(<MessageInput conversationId="conversation-1" />);

		await typist.upload(fileInput(container), image);
		await typist.click(sendButton());

		expect(await screen.findByText("Network is down")).toBeInTheDocument();
		expect(screen.getByAltText("Attached image preview")).toBeInTheDocument();
	});
});
