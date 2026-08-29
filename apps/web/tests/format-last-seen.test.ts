import { describe, expect, it } from "vitest";
import { formatLastSeen } from "@/features/chat/utils/format-last-seen";

const NOW = new Date("2026-08-30T12:00:00.000Z");

describe("formatLastSeen", () => {
	it("keeps a recent offline state relative", () => {
		expect(formatLastSeen("2026-08-30T11:52:00.000Z", NOW)).toBe("Last seen 8m ago");
	});

	it("shows hours for a longer pause on the same day", () => {
		expect(formatLastSeen("2026-08-30T09:00:00.000Z", NOW)).toBe("Last seen 3h ago");
	});

	it("keeps hidden presence distinct from offline presence", () => {
		expect(formatLastSeen(null, NOW)).toBeNull();
	});
});
