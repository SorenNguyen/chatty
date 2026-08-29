import type { AvatarSize } from "@/types/avatar";

/**
 * Box, corner and text size per avatar size.
 *
 * One map, used by the avatar itself and by anything that stands in for one, so
 * a row cannot end up with a 32px face beside a 40px placeholder. The text size
 * rides along because the fallback renders initials inside the same box, and so
 * does the radius: an avatar is a square with a small corner rather than a
 * circle, and the corner has to shrink with the box or a 32px one looks like a
 * different shape from a 40px one.
 */
export const AVATAR_SIZE_CLASSES: Record<AvatarSize, string> = {
	sm: "size-8 rounded-[5px] text-[10px]",
	md: "size-10 rounded-control text-xs",
	lg: "size-16 rounded-lg text-lg",
};

/**
 * The presence mark, which has to shrink with the avatar it sits on.
 *
 * Square, like everything else here. A round dot in the corner of a square
 * avatar reads as a notification badge — something asking to be dealt with —
 * rather than as the fact that somebody is connected.
 */
export const AVATAR_DOT_SIZE_CLASSES: Record<AvatarSize, string> = {
	sm: "size-2",
	md: "size-2.5",
	lg: "size-3",
};
