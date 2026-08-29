/**
 * Background and text colours for avatars that have no picture.
 *
 * Fixed list rather than a generated hue, so every fallback avatar is a
 * combination the initials are actually readable on. A hash into random HSL
 * eventually lands on yellow and produces an unreadable initial.
 *
 * Each entry carries its own text colour rather than assuming white. These are
 * pale tints holding dark initials, which is what lets an avatar sit on the
 * paper ground without becoming the brightest thing in the row — ten saturated
 * blocks down a sidebar is exactly the noise the ink-on-paper palette exists to
 * avoid. Lightness is held roughly level across the ten so no single person's
 * avatar reads as louder than anyone else's; only the hue moves.
 */
export const AVATAR_COLORS: string[] = [
	"bg-[oklch(0.89_0.045_25)] text-[oklch(0.40_0.09_25)]",
	"bg-[oklch(0.89_0.05_60)] text-[oklch(0.40_0.09_55)]",
	"bg-[oklch(0.90_0.05_95)] text-[oklch(0.40_0.09_85)]",
	"bg-[oklch(0.90_0.045_150)] text-[oklch(0.38_0.09_155)]",
	"bg-[oklch(0.89_0.045_185)] text-[oklch(0.38_0.08_190)]",
	"bg-[oklch(0.88_0.05_220)] text-[oklch(0.36_0.09_235)]",
	"bg-[oklch(0.88_0.05_265)] text-[oklch(0.37_0.10_270)]",
	"bg-[oklch(0.88_0.05_300)] text-[oklch(0.37_0.10_305)]",
	"bg-[oklch(0.88_0.05_340)] text-[oklch(0.37_0.10_345)]",
	"bg-[oklch(0.90_0.012_80)] text-[oklch(0.40_0.015_70)]",
];
