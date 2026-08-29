import type { AvatarSize } from "@/types/avatar";

/**
 * Box and text size per avatar size.
 *
 * One map, used by the avatar itself and by anything that stands in for one, so
 * a row cannot end up with a 32px face beside a 40px placeholder. The text size
 * rides along because the fallback renders initials inside the same box.
 */
export const AVATAR_SIZE_CLASSES: Record<AvatarSize, string> = {
	sm: "size-8 text-[0.625rem]",
	md: "size-10 text-xs",
	lg: "size-16 text-lg",
};

/**
 * Size of the presence mark, which has to shrink with the avatar it sits on.
 *
 * It is a square, not a dot. A circle in the corner of an avatar is the shape
 * every app on the phone uses for an unread notification, and reading "3 new
 * messages" as "online" is a worse mistake than reading it the other way round.
 * A square says presence and nothing else in this UI is that shape.
 */
export const AVATAR_DOT_SIZE_CLASSES: Record<AvatarSize, string> = {
	sm: "size-2",
	md: "size-2.5",
	lg: "size-3",
};
