import { describe, expect, it } from "vitest";
import { AVATAR_COLORS } from "@/constants/avatar-colors";
import { getAvatarColor } from "@/utils/avatar-color";
import { getInitials } from "@/utils/get-initials";

describe("getInitials", () => {
	it("takes the first and last word of a full name", () => {
		expect(getInitials("Nguyễn Tuấn Minh")).toBe("NM");
	});

	it("gives one letter for a single-word name", () => {
		expect(getInitials("Minh")).toBe("M");
	});

	it("ignores extra whitespace between and around words", () => {
		expect(getInitials("  An   Binh  ")).toBe("AB");
	});

	it("uppercases a lowercase name", () => {
		expect(getInitials("an binh")).toBe("AB");
	});

	it("falls back to a placeholder rather than rendering an empty circle", () => {
		expect(getInitials("   ")).toBe("?");
	});
});

describe("getAvatarColor", () => {
	it("gives the same user the same colour every time", () => {
		// The colour is how someone is recognised in a list, so it has to be
		// stable across renders, screens and devices without being stored.
		expect(getAvatarColor("user-abc")).toBe(getAvatarColor("user-abc"));
	});

	it("always returns one of the declared colours, including for an empty id", () => {
		expect(AVATAR_COLORS).toContain(getAvatarColor(""));
		expect(AVATAR_COLORS).toContain(getAvatarColor("cm4x9v2p10000abcdefghijkl"));
	});

	it("spreads ids across the palette rather than collapsing onto one colour", () => {
		// A hash that overflowed, or one keyed on something nearly constant, would
		// still pass every test above while painting the whole app one colour.
		const colors = new Set(Array.from({ length: 50 }, (_, index) => getAvatarColor(`cm4x9v2p1000${index}`)));

		expect(colors.size).toBeGreaterThan(3);
	});
});
