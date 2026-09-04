import type { AvatarSize } from "@/types/avatar";

/**
 * Box and text size per avatar size. Every avatar uses the same circular shape.
 *
 * One map, used by the avatar itself and by anything that stands in for one, so
 * a row cannot end up with a face beside a differently sized placeholder. The text size
 * rides along because the fallback renders initials inside the same box, and so
 */
export const AVATAR_SIZE_CLASSES: Record<AvatarSize, string> = {
	xs: "size-5 rounded-full text-[7px]",
	sm: "size-8 rounded-full text-[10px]",
	md: "size-11 rounded-full text-xs",
	lg: "size-16 rounded-full text-lg",
};

/**
 * The presence mark, which has to shrink with the avatar it sits on.
 *
 * Circular like the avatar it belongs to, so presence never looks like a
 * mismatched square notification pasted onto a person's photo.
 */
export const AVATAR_DOT_SIZE_CLASSES: Record<AvatarSize, string> = {
	xs: "size-1.5 rounded-full",
	sm: "size-2 rounded-full",
	md: "size-2.5 rounded-full",
	lg: "size-3 rounded-full",
};
