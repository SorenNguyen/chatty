import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageActions } from "@/features/chat/components/message-actions";

afterEach(() => {
	vi.useRealTimers();
});

describe("MessageActions", () => {
	it("removes author-only actions the moment their deadline passes", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-29T08:00:00.000Z"));
		render(
			<MessageActions
				onEdit={vi.fn()}
				onDeleteForEveryone={vi.fn()}
				onDeleteForMe={vi.fn()}
				authorActionExpiresAt="2026-08-29T08:00:01.000Z"
				align="end"
			/>,
		);
		fireEvent.click(screen.getByLabelText("Message actions"));
		expect(screen.getByRole("menuitem", { name: "Edit message" })).toBeInTheDocument();

		act(() => vi.advanceTimersByTime(1_000));

		expect(screen.queryByRole("menuitem", { name: "Edit message" })).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("menuitem", { name: "Delete message" }));
		expect(screen.getByRole("menuitem", { name: "Delete for me" })).toBeInTheDocument();
		expect(screen.queryByRole("menuitem", { name: "Delete for everyone" })).not.toBeInTheDocument();
	});

	it("supports arrow navigation and returns focus on Escape", () => {
		render(
			<MessageActions
				onEdit={vi.fn()}
				onDeleteForEveryone={vi.fn()}
				onDeleteForMe={vi.fn()}
				authorActionExpiresAt="2099-08-29T08:00:00.000Z"
				align="end"
			/>,
		);
		const trigger = screen.getByLabelText("Message actions");
		fireEvent.click(trigger);
		fireEvent.keyDown(document, { key: "ArrowDown" });
		expect(screen.getByRole("menuitem", { name: "Edit message" })).toHaveFocus();
		fireEvent.keyDown(document, { key: "ArrowDown" });
		expect(screen.getByRole("menuitem", { name: "Delete message" })).toHaveFocus();

		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
		expect(trigger).toHaveFocus();
	});
});
