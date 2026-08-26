import type { UserDTO } from "@chatty/shared-types";
import { AVATAR_DOT_SIZE_CLASSES, AVATAR_SIZE_CLASSES } from "@/constants/avatar-sizes";
import type { AvatarSize } from "@/types/avatar";
import { getAvatarColor } from "@/utils/avatar-color";
import { cn } from "@/utils/cn";
import { getInitials } from "@/utils/get-initials";

interface AvatarProps {
	user: UserDTO;
	size?: AvatarSize;
	/**
	 * Draws the online dot when true. Anything else — false, or omitted on a
	 * surface that does not track presence — draws no dot at all, because "we
	 * know they are away" and "we are not looking" should not render the same
	 * as each other by accident.
	 */
	isOnline?: boolean;
	className?: string;
}

export function Avatar({ user, size = "md", isOnline, className }: AvatarProps) {
	const initials = getInitials(user.displayName);

	return (
		<span className={cn("relative inline-flex shrink-0", className)}>
			{user.avatarUrl ? (
				<img
					src={user.avatarUrl}
					// The name, not "avatar of the name": a screen reader already says
					// "image", and the surrounding row usually says the name too, so
					// this is decoration next to a label it would otherwise duplicate.
					alt=""
					className={cn("rounded-full object-cover", AVATAR_SIZE_CLASSES[size])}
				/>
			) : (
				<span
					aria-hidden="true"
					className={cn(
						"flex items-center justify-center rounded-full font-semibold text-white",
						AVATAR_SIZE_CLASSES[size],
						getAvatarColor(user.id),
					)}
				>
					{initials}
				</span>
			)}

			{isOnline && (
				<span
					// Announced rather than left as a bare green dot: colour alone is
					// not a status anyone using a screen reader can perceive.
					role="status"
					aria-label={`${user.displayName} is online`}
					className={cn(
						"absolute bottom-0 right-0 rounded-full border-2 border-white bg-emerald-500",
						AVATAR_DOT_SIZE_CLASSES[size],
					)}
				/>
			)}
		</span>
	);
}
