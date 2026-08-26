/**
 * Background colours for avatars that have no picture.
 *
 * Fixed list rather than a generated hue, so every fallback avatar is a colour
 * that white text is actually readable on. A hash into random HSL eventually
 * lands on yellow and produces an unreadable initial.
 */
export const AVATAR_COLORS: string[] = [
	"bg-rose-500",
	"bg-orange-500",
	"bg-amber-600",
	"bg-emerald-600",
	"bg-teal-600",
	"bg-sky-600",
	"bg-indigo-500",
	"bg-violet-500",
	"bg-fuchsia-600",
	"bg-slate-600",
];
