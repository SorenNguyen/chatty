import type { ReactionDTO, UserDTO } from "@chatty/shared-types";

/**
 * The native tooltip on a reaction chip: the emoji, and who left it.
 *
 * Still worth having beside the reactor list rather than replaced by it. A
 * tooltip costs no click and no dialog, which is the right price for "who put
 * the heart there" in a conversation between two people; the list is for the
 * group where the answer does not fit in a title attribute. Neither reaches a
 * touch screen, which is why the overflow chip opens the list instead.
 */
export function getReactionSummary(reaction: ReactionDTO, users: UserDTO[], currentUserId: string): string {
	const names = reaction.userIds.map((userId) => {
		if (userId === currentUserId) return "you";

		return users.find((user) => user.id === userId)?.displayName ?? "Someone";
	});

	return `${reaction.emoji} ${names.join(", ")}`;
}
