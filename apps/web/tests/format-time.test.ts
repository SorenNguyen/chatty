import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatMessageTime } from "@/features/chat/utils/format-time";

// "Today" is relative to the clock, so the clock is pinned — otherwise these
// tests would pass all day and fail at midnight.
const NOW = new Date("2026-08-23T14:30:00");

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe("formatMessageTime", () => {
	it("shows only the time for a message sent today", () => {
		const formatted = formatMessageTime(new Date("2026-08-23T09:05:00").toISOString());

		expect(formatted).not.toMatch(/\d{2}\/\d{2}/);
		expect(formatted).toMatch(/\d{2}:\d{2}/);
	});

	it("includes the date for a message from another day", () => {
		// Scrolling back through history is unreadable when every line is just a
		// time with no indication of which day it belongs to.
		const formatted = formatMessageTime(new Date("2026-08-21T09:05:00").toISOString());

		expect(formatted).toMatch(/\d{2}\/\d{2}/);
		expect(formatted).toMatch(/\d{2}:\d{2}/);
	});

	it("treats earlier today as today, not as another day", () => {
		const formatted = formatMessageTime(new Date("2026-08-23T00:01:00").toISOString());

		expect(formatted).not.toMatch(/\d{2}\/\d{2}/);
	});
});
