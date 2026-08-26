import type { ConversationDTO, CurrentUserDTO, MessageDTO, ParticipantDTO, UserDTO } from "@chatty/shared-types";

/**
 * Builders for the wire types, shared by every test file.
 *
 * Here rather than copied per test because these shapes grow: adding
 * `unreadCount` and `lastReadMessageId` broke a fixture in three files at once,
 * and each copy had to be found and fixed by hand. One builder means the next
 * field is a one-line change.
 *
 * Every argument past the identifying ones is optional and defaults to
 * something inert, so a test only states the part it is actually about.
 */

const FIXED_DATE = "2026-01-01T00:00:00.000Z";

export function makeUser(id: string, displayName: string): UserDTO {
	return { id, handle: id, displayName, avatarUrl: null, createdAt: FIXED_DATE };
}

/**
 * You, rather than someone else. Separate from `makeUser` for the same reason
 * the wire types are separate: `email` belongs only to your own profile, and a
 * builder that adds it to everyone makes leaking it into a `UserDTO` easy.
 */
export function makeCurrentUser(overrides: Partial<CurrentUserDTO> = {}): CurrentUserDTO {
	return { ...makeUser("minh", "Minh"), email: "minh@chatty.test", ...overrides };
}

export function makeParticipant(
	id: string,
	displayName: string,
	lastReadMessageId: string | null = null,
): ParticipantDTO {
	return { ...makeUser(id, displayName), lastReadMessageId };
}

export function makeMessage(id: string, authorId: string, content: string): MessageDTO {
	return { id, conversationId: "conversation-1", authorId, content, createdAt: "2026-08-23T10:00:00.000Z" };
}

export function makeConversation(overrides: Partial<ConversationDTO> = {}): ConversationDTO {
	return {
		id: "conversation-1",
		isGroup: false,
		name: null,
		participants: [],
		lastMessage: null,
		unreadCount: 0,
		updatedAt: FIXED_DATE,
		...overrides,
	};
}
