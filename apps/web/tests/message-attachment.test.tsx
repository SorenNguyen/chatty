import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageAttachment } from "@/features/chat/components/message-attachment";
import { makeAttachment } from "./factories";

describe("MessageAttachment", () => {
	it("describes the image with its caption", () => {
		render(<MessageAttachment attachment={makeAttachment()} caption="the whiteboard" />);

		expect(screen.getByAltText("the whiteboard")).toBeInTheDocument();
	});

	it("still says something when there is no caption", () => {
		// An empty alt tells a screen reader the image is decorative, which would
		// make a message that is only a picture read as nothing at all.
		render(<MessageAttachment attachment={makeAttachment()} caption="" />);

		expect(screen.getByAltText("Image")).toBeInTheDocument();
	});

	it("sets width and height so the box is reserved before the image loads", () => {
		// Without these attributes every picture decoding mid-scroll shoves the
		// messages below it down.
		render(<MessageAttachment attachment={makeAttachment({ width: 1600, height: 800 })} caption="" />);

		const image = screen.getByAltText("Image");
		expect(image).toHaveAttribute("width", "320");
		expect(image).toHaveAttribute("height", "160");
	});

	it("loads lazily, because most of a loaded page is off screen", () => {
		render(<MessageAttachment attachment={makeAttachment()} caption="" />);

		expect(screen.getByAltText("Image")).toHaveAttribute("loading", "lazy");
	});
});
