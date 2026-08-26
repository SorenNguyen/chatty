import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/button";

describe("Button", () => {
	it("is type=button unless told otherwise", () => {
		// The HTML default is "submit", which makes any button inside a form a
		// candidate for implicit submission — pressing Enter in a text field
		// activates the form's *first* submit button, whatever it was for.
		render(<Button>Do a thing</Button>);

		expect(screen.getByRole("button")).toHaveAttribute("type", "button");
	});

	it("still submits when a caller asks it to", () => {
		render(<Button type="submit">Send</Button>);

		expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
	});

	it("does not submit its form when pressing Enter elsewhere in it", async () => {
		// The shipped bug this default exists to prevent: attaching an image and
		// pressing Enter fired the preview's remove button, dropping the picture
		// before the send it was meant to accompany.
		const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
		const onRemove = vi.fn();
		const typist = userEvent.setup();

		render(
			<form onSubmit={onSubmit}>
				<Button onClick={onRemove}>Remove</Button>
				<input aria-label="Message" />
				<Button type="submit">Send</Button>
			</form>,
		);

		await typist.type(screen.getByLabelText("Message"), "hello{Enter}");

		expect(onRemove).not.toHaveBeenCalled();
		expect(onSubmit).toHaveBeenCalledTimes(1);
	});
});
