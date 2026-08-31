import { describe, expect, it } from "vitest";
import { mergeReloadedMessages } from "@/features/chat/utils";
import { makeMessage } from "./factories";

describe("mergeReloadedMessages", () => {
	it("adds messages that arrived while the socket was down", () => {
		const current = [makeMessage("m1", "minh", "one"), makeMessage("m2", "an", "two")];
		const reloaded = [makeMessage("m2", "an", "two"), makeMessage("m3", "an", "three")];

		expect(mergeReloadedMessages(current, reloaded).map((message) => message.id)).toEqual(["m1", "m2", "m3"]);
	});

	it("takes the reloaded copy of a message that changed while the socket was down", () => {
		const current = [makeMessage("m1", "minh", "typo")];
		const reloaded = [makeMessage("m1", "minh", "fixed", [], { editedAt: "2026-08-23T11:00:00.000Z" })];

		const [merged, ...rest] = mergeReloadedMessages(current, reloaded);

		expect(rest).toHaveLength(0);
		expect(merged?.content).toBe("fixed");
		expect(merged?.editedAt).not.toBeNull();
	});

	it("replaces everything when the two no longer overlap, rather than stitching a gap", () => {
		// More than a page arrived while the connection was gone, so the newest page
		// does not reach back to what is on screen. Keeping both halves would render
		// a thread with a hole in it and nothing saying so.
		const current = [makeMessage("m1", "minh", "old"), makeMessage("m2", "minh", "older")];
		const reloaded = [makeMessage("m90", "an", "recent"), makeMessage("m91", "an", "newest")];

		expect(mergeReloadedMessages(current, reloaded).map((message) => message.id)).toEqual(["m90", "m91"]);
	});

	it("keeps history the reloaded page does not reach", () => {
		const current = [makeMessage("m1", "minh", "one"), makeMessage("m2", "an", "two")];
		const reloaded = [makeMessage("m2", "an", "two")];

		expect(mergeReloadedMessages(current, reloaded).map((message) => message.id)).toEqual(["m1", "m2"]);
	});

	it("returns the reloaded page when nothing is on screen yet", () => {
		const reloaded = [makeMessage("m1", "minh", "one")];

		expect(mergeReloadedMessages([], reloaded)).toEqual(reloaded);
	});

	it("leaves the screen alone when the reload came back empty", () => {
		const current = [makeMessage("m1", "minh", "one")];

		expect(mergeReloadedMessages(current, [])).toEqual(current);
	});
});
