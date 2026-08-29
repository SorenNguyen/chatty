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
 * Square, not round.
 *
 * A rounded square reads as a record — a row in a list of people — where a
 * circle reads as a face. This app puts avatars next to timestamps and counts
 * far more often than it puts them next to photographs, and the square sits in
 * that company without pulling focus. It also gives the group avatar somewhere
 * to go: a filled ink square for a group against a tinted one for a person is a
 * difference you can see at 32px, which two circles are not.
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
					className={cn("rounded-md object-cover", AVATAR_SIZE_CLASSES[size])}
				/>
			) : (
				<span
					aria-hidden="true"
					className={cn(
						// Mono initials: they are a stand-in for a picture rather than
						// someone's name written out, and the whole UI sets what a
						// machine derived in mono.
						"flex items-center justify-center rounded-md font-mono font-semibold",
						AVATAR_SIZE_CLASSES[size],
						getAvatarColor(user.id),
					)}
				>
					{initials}
				</span>
			)}

			{isOnline && (
				<span
					// Announced rather than left as a bare green square: colour alone is
					// not a status anyone using a screen reader can perceive.
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
