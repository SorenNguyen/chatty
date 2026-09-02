import type { UserDTO } from "@chatty/shared-types";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { toUserDTO, userSelect } from "../users/users.mapper.js";

/**
 * Blocking, and the one question every direct write has to ask first.
 *
 * The row is directed — it records who did it — but the *effect* is symmetric:
 * neither person can send to the other, and neither appears in the other's
 * search. That asymmetry between storage and behaviour is deliberate. Two rows
 * would make "who blocked whom" unanswerable, and only the blocker's own row can
 * be removed; the blocked person unblocking themselves is not a thing.
 *
 * Groups are untouched, which is the same answer WhatsApp, Messenger and
 * Telegram give. Hiding a blocked person's messages inside a room both people
 * are in is Discord's answer, and it makes paging, unread counts and read
 * markers resolve differently for two people reading one thread.
 */
export async function blockUser(currentUserId: string, targetUserId: string): Promise<void> {
	if (currentUserId === targetUserId) throw new ValidationError("You cannot block yourself");

	const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
	if (!target) throw new NotFoundError("User not found");

	// Blocking twice is not an error anybody should have to handle, and the
	// unique index is what lets this say so in one statement rather than a
	// read-then-write that two tabs could both pass.
	await prisma.userBlock.upsert({
		where: { blockerId_blockedId: { blockerId: currentUserId, blockedId: targetUserId } },
		create: { blockerId: currentUserId, blockedId: targetUserId },
		update: {},
		select: { id: true },
	});
}

/** Removes the caller's own block. Unblocking someone who is not blocked is a no-op. */
export async function unblockUser(currentUserId: string, targetUserId: string): Promise<void> {
	await prisma.userBlock.deleteMany({ where: { blockerId: currentUserId, blockedId: targetUserId } });
}

/** Everyone the caller has blocked, so the setting can show a list to undo from. */
export async function listBlockedUsers(currentUserId: string): Promise<UserDTO[]> {
	const blocks = await prisma.userBlock.findMany({
		where: { blockerId: currentUserId },
		orderBy: { createdAt: "desc" },
		select: { blocked: { select: userSelect } },
	});

	return blocks.map((block) => toUserDTO(block.blocked));
}

/**
 * The ids of everyone in either direction of a block with this user.
 *
 * One query for both directions, because every caller wants the same thing: a
 * set of people to leave out. Search uses it to filter, and it is the reason
 * blocking hides you from the person you blocked as well as them from you —
 * otherwise they could still find you, message you, and be told nothing.
 */
export async function listBlockedUserIds(currentUserId: string): Promise<string[]> {
	const blocks = await prisma.userBlock.findMany({
		where: { OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }] },
		select: { blockerId: true, blockedId: true },
	});

	return [...new Set(blocks.map((block) => (block.blockerId === currentUserId ? block.blockedId : block.blockerId)))];
}

/**
 * Refuses a direct write when either person has blocked the other.
 *
 * Deliberately says the same thing whichever way the block runs. Telling a
 * sender "they have blocked you" hands them a fact about somebody who has just
 * asked not to hear from them, and telling them apart is how a blocked person
 * confirms they were blocked. Both directions are one sentence about the
 * conversation, not about either person.
 */
export async function assertNotBlocked(currentUserId: string, otherUserId: string): Promise<void> {
	const block = await prisma.userBlock.findFirst({
		where: {
			OR: [
				{ blockerId: currentUserId, blockedId: otherUserId },
				{ blockerId: otherUserId, blockedId: currentUserId },
			],
		},
		select: { id: true },
	});

	if (block) throw new ForbiddenError("This conversation is unavailable");
}
