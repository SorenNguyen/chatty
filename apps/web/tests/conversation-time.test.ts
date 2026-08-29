import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatConversationTime } from "@/features/chat/utils/conversation-time";

// A Sunday afternoon, so "within the past week" and "the same weekday name" are
// two different things and the test can tell them apart.
const NOW = new Date("2026-08-23T14:30:00");

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe("formatConversationTime", () => {
	it("counts minutes inside the first hour", () => {
		expect(formatConversationTime(new Date("2026-08-23T14:29:30").toISOString())).toBe("now");
		expect(formatConversationTime(new Date("2026-08-23T14:25:00").toISOString())).toBe("5m");
	});

	it("switches to a clock time later the same day", () => {
		expect(formatConversationTime(new Date("2026-08-23T09:12:00").toISOString())).toMatch(/\d{2}:\d{2}/);
	});

	it("names yesterday rather than dating it", () => {
		expect(formatConversationTime(new Date("2026-08-22T09:12:00").toISOString())).toBe("Yest.");
	});

	it("uses whole calendar days, not elapsed hours", () => {
		// Ninety minutes earlier, and still yesterday. Dividing elapsed time by
		// twenty-four hours would call this today.
		expect(formatConversationTime(new Date("2026-08-22T23:50:00").toISOString())).toBe("Yest.");
	});

	it("gives a weekday for the rest of the past week", () => {
		const label = formatConversationTime(new Date("2026-08-19T09:12:00").toISOString());

		expect(label).not.toMatch(/\d/);
		expect(label.length).toBeGreaterThan(1);
	});

	it("falls back to a date once a week has passed", () => {
		expect(formatConversationTime(new Date("2026-08-12T09:12:00").toISOString())).toMatch(/12/);
	});
});
