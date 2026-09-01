import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildDocumentTitle } from "@/features/chat/utils";
import { useDocumentTitle } from "@/features/chat/hooks/use-document-title";
import { makeConversation } from "./factories";

afterEach(() => {
	document.title = "";
});

describe("buildDocumentTitle", () => {
	it("is just the app name when nothing is waiting", () => {
		expect(buildDocumentTitle(0)).toBe("Chatty");
	});

	it("puts the count first, where a truncated tab still shows it", () => {
		expect(buildDocumentTitle(3)).toBe("(3) Chatty");
	});

	it("caps the count rather than printing four digits into a narrow tab", () => {
		expect(buildDocumentTitle(99)).toBe("(99) Chatty");
		expect(buildDocumentTitle(100)).toBe("(99+) Chatty");
	});

	// The sum comes from the same per-conversation counts the badges render, and
	// a negative one would mean those disagreed. Treated as nothing rather than
	// printed, because "(-1)" in a tab title helps nobody.
	it("treats an impossible count as nothing waiting", () => {
		expect(buildDocumentTitle(-1)).toBe("Chatty");
	});

	it("excludes conversations that are currently muted", () => {
		renderHook(() =>
			useDocumentTitle([
				makeConversation({ unreadCount: 4, mutedUntil: "9999-12-31T23:59:59.999Z" }),
				makeConversation({ id: "audible", unreadCount: 2 }),
			]),
		);

		expect(document.title).toBe("(2) Chatty");
	});
});
