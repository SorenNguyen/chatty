import type { AvatarSize } from "@/types/avatar";

/**
 * Box and text size per avatar size.
 *
 * One map, used by the avatar itself and by anything that stands in for one, so
 * a row cannot end up with a 32px face beside a 40px placeholder. The text size
 * rides along because the fallback renders initials inside the same box.
 */
export const AVATAR_SIZE_CLASSES: Record<AvatarSize, string> = {
	sm: "size-8 text-xs",
	md: "size-10 text-sm",
	lg: "size-12 text-base",
};

/** Size of the online dot, which has to shrink with the avatar it sits on. */
export const AVATAR_DOT_SIZE_CLASSES: Record<AvatarSize, string> = {
	sm: "size-2.5",
	md: "size-3",
	lg: "size-3.5",
};
