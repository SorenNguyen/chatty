import type { UserDTO } from "@chatty/shared-types";
import { buildAvatarUrl } from "../../lib/avatar-storage.js";

/**
 * The columns a `UserDTO` needs, and how they become one.
 *
 * A second mapper file in a module the conventions describe as four, for the
 * same reason `messages.mapper` exists: three modules had grown their own copy
 * of this five-line projection — users (search, profile), conversations
 * (participants), and now messages (an embedded author). They had already
 * drifted once in shape, and `avatarUrl` is exactly the field where a fourth
 * copy would quietly forget the `?v=` cache-buster.
 *
 * It imports no service, so every module can import it without a cycle.
 */
export const userSelect = {
	id: true,
	handle: true,
	displayName: true,
	avatarUpdatedAt: true,
	createdAt: true,
} as const;

export interface UserRow {
	id: string;
	handle: string;
	displayName: string;
	avatarUpdatedAt: Date | null;
	createdAt: Date;
}

export function toUserDTO(row: UserRow): UserDTO {
	return {
		id: row.id,
		handle: row.handle,
		displayName: row.displayName,
		// Derived, never stored — see the field's doc comment in shared-types.
		avatarUrl: buildAvatarUrl(row.id, row.avatarUpdatedAt),
		createdAt: row.createdAt.toISOString(),
	};
}
