import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageInput } from "@/features/chat/components/message-input";

/**
 * The composer no longer calls the API. A text message is put on screen before
 * the round trip finishes, and the thread is this component's sibling, so the
 * send belongs to the page that owns both — see `useConversationMessages`.
 */
const onSend = vi.fn();

// The typing notifier talks to a socket, which is not what these tests are about.
vi.mock("@/features/chat/hooks", () => ({
	useTypingNotifier: () => ({ notifyTyping: vi.fn(), stopTyping: vi.fn() }),
}));

beforeEach(() => {
	onSend.mockReset().mockResolvedValue(undefined);
	// jsdom has no object URL implementation; the preview needs one.
	URL.createObjectURL = vi.fn(() => "blob:preview");
	URL.revokeObjectURL = vi.fn();
});

function renderInput() {
	return render(
		<MessageInput
			conversationId="conversation-1"
			replyTo={null}
			onCancelReply={vi.fn()}
			onSend={onSend}
			onSendSticker={vi.fn()}
		/>,
	);
}

/** The hidden file input, which has no label to query by. */
function fileInput(container: HTMLElement): HTMLInputElement {
	return container.querySelector('input[type="file"]') as HTMLInputElement;
}

/** The submit button. An arrow with no words on it, so it carries a label. */
function sendButton(): HTMLElement {
	return screen.getByRole("button", { name: "Send message" });
}

const image = new File(["pretend-bytes"], "photo.png", { type: "image/png" });

describe("MessageInput", () => {
	it("cannot send a message that is neither text nor picture", () => {
		renderInput();

		expect(sendButton()).toBeDisabled();
	});

	it("enables sending as soon as a picture is attached, with no text", async () => {
		const typist = userEvent.setup();
		const { container } = renderInput();

		await typist.upload(fileInput(container), image);

		expect(sendButton()).toBeEnabled();
	});

	it("sends text with no attachment", async () => {
		const typist = userEvent.setup();
		renderInput();

		await typist.type(screen.getByLabelText("Message"), "hello{Enter}");

		expect(onSend).toHaveBeenCalledWith("hello", [], null);
	});

	it("empties the field before the send resolves, so the next message need not wait", async () => {
		// The message is already in the thread as a pending bubble by this point.
		let releaseSend: (() => void) | undefined;
		onSend.mockReturnValue(
			new Promise<void>((resolve) => {
				releaseSend = resolve;
			}),
		);
		const typist = userEvent.setup();
		renderInput();

		await typist.type(screen.getByLabelText("Message"), "hello{Enter}");

		expect(screen.getByLabelText("Message")).toHaveValue("");

		releaseSend?.();
	});

	it("lets an image be sent with no text at all", async () => {
		// The whole reason the send button's guard changed: a picture is a message.
		const typist = userEvent.setup();
		const { container } = renderInput();

		await typist.upload(fileInput(container), image);
		await typist.click(sendButton());

		expect(onSend).toHaveBeenCalledWith("", [image], null, expect.any(Function));
	});

	it("sends an image together with its caption", async () => {
		const typist = userEvent.setup();
		const { container } = renderInput();

		await typist.upload(fileInput(container), image);
		await typist.type(screen.getByLabelText("Message"), "look at this{Enter}");

		expect(onSend).toHaveBeenCalledWith("look at this", [image], null, expect.any(Function));
	});

	it("shows a preview that can be removed again", async () => {
		const typist = userEvent.setup();
		const { container } = renderInput();

		await typist.upload(fileInput(container), image);
		expect(screen.getByAltText("Attached image preview 1")).toBeInTheDocument();

		await typist.click(screen.getByRole("button", { name: "Remove attached image 1" }));

		expect(screen.queryByAltText("Attached image preview 1")).not.toBeInTheDocument();
	});

	it("releases the object URL when the picture is removed", async () => {
		// Otherwise the file stays in memory for the life of the tab.
		const typist = userEvent.setup();
		const { container } = renderInput();

		await typist.upload(fileInput(container), image);
		await typist.click(screen.getByRole("button", { name: "Remove attached image 1" }));

		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
	});

	it("clears the attachment after a successful send", async () => {
		const typist = userEvent.setup();
		const { container } = renderInput();

		await typist.upload(fileInput(container), image);
		await typist.click(sendButton());

		expect(await screen.findByLabelText("Message")).toHaveValue("");
		expect(screen.queryByAltText("Attached image preview 1")).not.toBeInTheDocument();
	});

	it("sends every picture that was picked, in the order they were picked", async () => {
		const typist = userEvent.setup();
		const { container } = renderInput();
		const second = new File(["more-bytes"], "second.png", { type: "image/png" });

		await typist.upload(fileInput(container), [image, second]);
		await typist.click(sendButton());

		expect(onSend).toHaveBeenCalledWith("", [image, second], null, expect.any(Function));
	});

	it("adds to the set on a second trip to the file dialog rather than replacing it", async () => {
		// Picking three photos, remembering a fourth and picking it should leave
		// four attached. Replacing is the behaviour that loses work silently.
		const typist = userEvent.setup();
		const { container } = renderInput();
		const second = new File(["more-bytes"], "second.png", { type: "image/png" });

		await typist.upload(fileInput(container), image);
		await typist.upload(fileInput(container), second);

		expect(screen.getByAltText("Attached image preview 1")).toBeInTheDocument();
		expect(screen.getByAltText("Attached image preview 2")).toBeInTheDocument();
	});

	it("removes the one that was clicked, not the first", async () => {
		const typist = userEvent.setup();
		const { container } = renderInput();
		const second = new File(["more-bytes"], "second.png", { type: "image/png" });

		await typist.upload(fileInput(container), [image, second]);
		await typist.click(screen.getByRole("button", { name: "Remove attached image 1" }));
		await typist.click(sendButton());

		expect(onSend).toHaveBeenCalledWith("", [second], null, expect.any(Function));
	});

	it("refuses more than the cap, and says so", async () => {
		// Refusing before the upload is the difference between a sentence and a
		// hundred megabytes crossing the wire to be rejected at the other end.
		const typist = userEvent.setup();
		const { container } = renderInput();
		const eleven = Array.from(
			{ length: 11 },
			(_, index) => new File(["bytes"], `photo-${index}.png`, { type: "image/png" }),
		);

		await typist.upload(fileInput(container), eleven);

		expect(screen.getByRole("alert")).toHaveTextContent("at most 10 images");
		expect(screen.getAllByAltText(/Attached image preview/)).toHaveLength(10);
		expect(screen.getByRole("button", { name: "At most 10 images" })).toBeDisabled();
	});

	it("keeps the attachment when the send fails", async () => {
		// Re-picking a photo after a dropped connection is the most annoying
		// possible way to lose it. Only the image path reports here: a failed text
		// send is marked on its own bubble in the thread instead.
		onSend.mockRejectedValue(new Error("Network is down"));
		const typist = userEvent.setup();
		const { container } = renderInput();

		await typist.upload(fileInput(container), image);
		await typist.click(sendButton());

		expect(await screen.findByText("Network is down")).toBeInTheDocument();
		expect(screen.getByAltText("Attached image preview 1")).toBeInTheDocument();
	});
});
