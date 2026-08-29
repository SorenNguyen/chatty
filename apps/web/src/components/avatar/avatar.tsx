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
	 * Draws the presence mark when true. Anything else — false, or omitted on a
	 * surface that does not track presence — draws no mark at all, because "we
	 * know they are away" and "we are not looking" should not render the same
	 * as each other by accident.
	 */
	isOnline?: boolean;
	className?: string;
}

/**
 * Someone's face, or the initials standing in for it.
 *
 * A rounded square rather than a circle, with the initials set in mono: they
 * are a machine's reduction of a name, not the name, and everything in this app
 * that a machine produced is set the same way.
 */
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
					className={cn("object-cover", AVATAR_SIZE_CLASSES[size])}
				/>
			) : (
				<span
					aria-hidden="true"
					className={cn(
						"flex items-center justify-center font-mono font-semibold tracking-tight",
						AVATAR_SIZE_CLASSES[size],
						getAvatarColor(user.id),
					)}
				>
					{initials}
				</span>
			)}

			{isOnline && (
				<span
					// Announced rather than left as a bare green square: colour alone
					// is not a status anyone using a screen reader can perceive.
					role="status"
					aria-label={`${user.displayName} is online`}
					className={cn(
						"absolute -bottom-0.5 -right-0.5 border-2 border-paper-raised bg-live",
						AVATAR_DOT_SIZE_CLASSES[size],
					)}
				/>
			)}
		</span>
	);
}
