import type { CurrentUserDTO, UserDTO } from "@chatty/shared-types";
import { buildAvatarUrl, deleteAvatar, findAvatarPath, saveAvatar } from "../../lib/avatar-storage.js";
import { NotFoundError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { SearchUsersQuery } from "./users.schema.js";

/**
 * Loads the signed-in user's own profile.
 *
 * Returns the DTO shape explicitly rather than the Prisma row: `createdAt` is a
 * `Date` in the database and an ISO string on the wire, so mapping it here makes
 * the compiler check the contract in packages/shared-types instead of leaving it
 * to whatever `res.json()` happens to serialize.
 */
export async function getUserById(userId: string): Promise<CurrentUserDTO> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		// `passwordHash` is never selected — see docs/conventions/backend.md.
		select: { id: true, email: true, handle: true, displayName: true, avatarUpdatedAt: true, createdAt: true },
	});

	// findUnique + explicit throw, not findUniqueOrThrow: the latter raises a
	// Prisma error the error middleware would turn into a 500, not a 404.
	if (!user) throw new NotFoundError("User not found");

	return {
		id: user.id,
		email: user.email,
		handle: user.handle,
		displayName: user.displayName,
		avatarUrl: buildAvatarUrl(user.id, user.avatarUpdatedAt),
		createdAt: user.createdAt.toISOString(),
	};
}

/**
 * Finds people to start a conversation with.
 *
 * Matches on handle and email as well as display name — you generally know a
 * colleague's handle or email, not how they spelled their name — but returns
 * `UserDTO`, which has no email field. So an exact address finds the right
 * person, while searching common letters cannot be used to harvest addresses.
 *
 * The handle *is* returned, and that is the point: display names are not
 * unique, so without it two people called "Minh" are indistinguishable in the
 * results and you cannot tell which one to message.
 */
export async function searchUsers(currentUserId: string, query: SearchUsersQuery): Promise<UserDTO[]> {
	const users = await prisma.user.findMany({
		where: {
			id: { not: currentUserId },
			OR: [
				{ handle: { contains: query.query, mode: "insensitive" } },
				{ displayName: { contains: query.query, mode: "insensitive" } },
				{ email: { contains: query.query, mode: "insensitive" } },
			],
		},
		orderBy: { handle: "asc" },
		take: query.limit,
		select: { id: true, handle: true, displayName: true, avatarUpdatedAt: true, createdAt: true },
	});

	return users.map((user) => ({
		id: user.id,
		handle: user.handle,
		displayName: user.displayName,
		avatarUrl: buildAvatarUrl(user.id, user.avatarUpdatedAt),
		createdAt: user.createdAt.toISOString(),
	}));
}

/**
 * Replaces the signed-in user's avatar and returns their refreshed profile.
 *
 * The file is written before the timestamp is stored, and the order matters: a
 * timestamp with no file behind it produces a URL that 404s for everyone,
 * whereas a file with no timestamp is invisible and gets overwritten by the
 * next upload. Failing towards the harmless one is worth the orphan.
 */
export async function setAvatar(userId: string, upload: Buffer): Promise<CurrentUserDTO> {
	await saveAvatar(userId, upload);
	await prisma.user.update({ where: { id: userId }, data: { avatarUpdatedAt: new Date() }, select: { id: true } });

	return getUserById(userId);
}

/** Drops the signed-in user's avatar, falling them back to generated initials. */
export async function clearAvatar(userId: string): Promise<CurrentUserDTO> {
	await prisma.user.update({ where: { id: userId }, data: { avatarUpdatedAt: null }, select: { id: true } });
	await deleteAvatar(userId);

	return getUserById(userId);
}

/**
 * Path of the file to serve for `GET /users/:id/avatar`.
 *
 * Returns a path rather than bytes so the controller can hand it to
 * `res.sendFile`, which sets the caching and range headers an image response
 * wants — reading it into a Buffer here would mean re-implementing those.
 *
 * Checks the database first: a file left behind by a failed `clearAvatar` must
 * not keep being served after the user asked for it to be gone.
 */
export async function getAvatarFilePath(userId: string): Promise<string> {
	const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUpdatedAt: true } });
	if (!user?.avatarUpdatedAt) throw new NotFoundError("No avatar set");

	const filePath = await findAvatarPath(userId);
	if (!filePath) throw new NotFoundError("No avatar set");

	return filePath;
}
