import type { ReactionDTO, UserDTO } from "@chatty/shared-types";

export function getReactionSummary(
	reaction: ReactionDTO,
	users: UserDTO[],
	currentUserId: string,
	reactionLabel: string,
): string {
	const names = reaction.userIds.map((userId) => {
		if (userId === currentUserId) return "you";

		return users.find((user) => user.id === userId)?.displayName ?? "Someone";
	});

	return `${reactionLabel} by ${names.join(", ")}`;
}
