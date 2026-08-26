import { describe, expect, it } from "vitest";
import { getTypingMessage } from "@/features/chat/utils/typing-message";
import { makeParticipant } from "./factories";

const participants = [
	makeParticipant("minh", "Minh"),
	makeParticipant("an", "An"),
	makeParticipant("binh", "Binh"),
	makeParticipant("chi", "Chi"),
];

describe("getTypingMessage", () => {
	it("says nothing when nobody is typing", () => {
		expect(getTypingMessage([], participants)).toBeNull();
	});

	it("names one typist", () => {
		expect(getTypingMessage(["an"], participants)).toBe("An is typing…");
	});

	it("names two typists", () => {
		expect(getTypingMessage(["an", "binh"], participants)).toBe("An and Binh are typing…");
	});

	it("counts instead of naming past two", () => {
		expect(getTypingMessage(["an", "binh", "chi"], participants)).toBe("3 people are typing…");
	});

	it("drops ids that are not in the participant list", () => {
		// Happens when someone joins after the conversation was last fetched.
		// Showing "Unknown is typing" would be worse than showing only who we know.
		expect(getTypingMessage(["an", "someone-not-loaded"], participants)).toBe("An is typing…");
	});

	it("says nothing when none of the ids can be resolved", () => {
		expect(getTypingMessage(["ghost"], participants)).toBeNull();
	});
});
