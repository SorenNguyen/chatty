import type { RestrictedUsersPageDTO, RestrictionStatusDTO } from "@chatty/shared-types";
import type { Prisma } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getOptionalIO, userRoom } from "../../lib/socket-bus.js";
import { toUserDTO, userSelect } from "../users/users.mapper.js";
import type { ListRestrictedUsersQuery } from "./restrictions.schema.js";

type RestrictionReader = Pick<Prisma.TransactionClient, "userRestriction">;

/**
 * Restricting, and the three things it changes.
 *
 * A block refuses the write. A restriction refuses **nothing** — the message is
 * written, delivered and readable — and instead changes where it lands and what
 * it reveals: the conversation moves to Message requests, it stops counting
 * towards anything that could produce a notification, and this person stops
 * seeing your read receipts and your presence.
 *
 * The row is directed and, unlike a block, so is every effect. That asymmetry is
 * the feature: a block is a wall between two people, while a restriction is
 * something one person does to their own inbox. Restricting somebody does not
 * take away *your* view of them, which is why you can still read the thread and
 * still see when they are online.
 *
 * Nobody is told. That is the whole difference from blocking as far as the other
 * person can observe, and it is why none of the enforcement below may ever
 * produce an error a sender could tell apart from an ordinary success.
 */
export async function restrictUser(currentUserId: string, targetUserId: string): Promise<void> {
	if (currentUserId === targetUserId) throw new ValidationError("You cannot restrict yourself");

	await prisma.$transaction(async (transaction) => {
		const target = await transaction.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
		if (!target) throw new NotFoundError("User not found");

		// Restricting twice is not an error anybody should have to handle, and the
		// unique index is what lets this say so in one statement rather than a
		// read-then-write that two tabs could both pass.
		await transaction.userRestriction.upsert({
			where: {
				restrictorId_restrictedId: { restrictorId: currentUserId, restrictedId: targetUserId },
			},
			create: { restrictorId: currentUserId, restrictedId: targetUserId },
			update: {},
			select: { id: true },
		});
	});

	announceToOwnSessions(currentUserId, targetUserId, true);
}

/** Removes the caller's own restriction. Unrestricting someone who is not restricted is a no-op. */
export async function unrestrictUser(currentUserId: string, targetUserId: string): Promise<void> {
	await prisma.userRestriction.deleteMany({
		where: { restrictorId: currentUserId, restrictedId: targetUserId },
	});

	announceToOwnSessions(currentUserId, targetUserId, false);
}

/**
 * Tells the actor's other tabs and devices, and nobody else at all.
 *
 * The same rule `block:changed` follows and for a stronger reason: a block is
 * observable to the person blocked the moment they try to send, while a
 * restriction is designed to be unobservable. An event reaching the restricted
 * person would be the only way they could ever find out, and its *arrival* would
 * say it even with an empty payload.
 *
 * Best-effort: the row is already committed, and an API that answered 500 here
 * would tell the caller nothing changed when the database says otherwise.
 */
function announceToOwnSessions(actorUserId: string, otherUserId: string, isRestricted: boolean): void {
	getOptionalIO()?.to(userRoom(actorUserId)).emit("restriction:changed", { userId: otherUserId, isRestricted });
}

/** A cursor page for the privacy settings, never an unbounded account-sized list. */
export async function listRestrictedUsers(
	currentUserId: string,
	query: ListRestrictedUsersQuery,
): Promise<RestrictedUsersPageDTO> {
	const cursor = query.before
		? await prisma.userRestriction.findFirst({
				where: { id: query.before, restrictorId: currentUserId },
				select: { id: true, createdAt: true },
			})
		: null;
	if (query.before && !cursor) throw new NotFoundError("Restricted user not found");

	const restrictions = await prisma.userRestriction.findMany({
		where: {
			restrictorId: currentUserId,
			...(cursor
				? {
						OR: [
							{ createdAt: { lt: cursor.createdAt } },
							{ createdAt: cursor.createdAt, id: { lt: cursor.id } },
						],
					}
				: {}),
		},
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		take: query.limit + 1,
		select: { id: true, restricted: { select: userSelect } },
	});
	const items = restrictions.slice(0, query.limit);

	return {
		items: items.map((restriction) => toUserDTO(restriction.restricted)),
		nextCursor: restrictions.length > query.limit ? (items.at(-1)?.id ?? null) : null,
	};
}

/**
 * The only restriction fact a caller may ask about: whether they restricted this
 * user.
 *
 * Answering the reverse would hand the restricted person the one thing the
 * feature exists to withhold. A missing target is deliberately false too, so
 * probing arbitrary ids reveals no account information.
 */
export async function getRestrictionStatus(currentUserId: string, targetUserId: string): Promise<RestrictionStatusDTO> {
	const restriction = await prisma.userRestriction.findUnique({
		where: { restrictorId_restrictedId: { restrictorId: currentUserId, restrictedId: targetUserId } },
		select: { id: true },
	});

	return { isRestricted: restriction !== null };
}

/**
 * Whether `currentUserId` has restricted the other person.
 *
 * One direction only, and every caller wants this one: it is the question
 * "should something of mine be withheld from them", asked by the read-receipt
 * and presence paths about the person whose data is about to travel.
 */
export async function hasRestricted(
	currentUserId: string,
	otherUserId: string,
	database: RestrictionReader = prisma,
): Promise<boolean> {
	const restriction = await database.userRestriction.findUnique({
		where: { restrictorId_restrictedId: { restrictorId: currentUserId, restrictedId: otherUserId } },
		select: { id: true },
	});

	return restriction !== null;
}

/** The peer of a direct conversation, or null for a group or a missing room. */
async function findDirectPeerId(
	currentUserId: string,
	conversationId: string,
	database: Pick<Prisma.TransactionClient, "conversation"> = prisma,
): Promise<string | null> {
	const conversation = await database.conversation.findUnique({
		where: { id: conversationId },
		select: { isGroup: true, participants: { select: { userId: true } } },
	});
	if (!conversation || conversation.isGroup) return null;

	return conversation.participants.find((participant) => participant.userId !== currentUserId)?.userId ?? null;
}

/**
 * Whether this direct conversation is one the caller has restricted.
 *
 * Groups are exempt for the same reason they are exempt from blocking: a room
 * several people share is not a relationship one of them gets to redefine, and
 * hiding one member's messages there makes unread counts and read markers
 * resolve differently for two people reading one thread.
 */
export async function isDirectConversationRestricted(
	currentUserId: string,
	conversationId: string,
	database: Pick<Prisma.TransactionClient, "conversation" | "userRestriction"> = prisma,
): Promise<boolean> {
	const otherUserId = await findDirectPeerId(currentUserId, conversationId, database);

	return otherUserId ? hasRestricted(currentUserId, otherUserId, database) : false;
}
