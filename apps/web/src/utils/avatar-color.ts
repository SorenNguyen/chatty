import { AVATAR_COLORS } from "@/constants/avatar-colors";

/**
 * Picks the fallback avatar colour for a user.
 *
 * Keyed on the id, not the display name: the colour is how you recognise
 * someone at a glance in a list, so it must not change when they rename
 * themselves — and two people called "Minh" must not come out identical.
 *
 * Deterministic, so every screen and every device agrees without storing
 * anything.
 */
export function getAvatarColor(userId: string): string {
	let hash = 0;
	for (let index = 0; index < userId.length; index += 1) {
		// Same shift-and-subtract mix as Java's String.hashCode. `| 0` keeps it in
		// 32-bit range; without it the value drifts past Number.MAX_SAFE_INTEGER
		// on long ids and neighbouring ids start colliding.
		hash = (hash << 5) - hash + userId.charCodeAt(index);
		hash |= 0;
	}

	return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}
