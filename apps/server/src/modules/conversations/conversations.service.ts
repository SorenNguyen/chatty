import type {
	ConversationDTO,
	ConversationReadEvent,
	ConversationUpdatedEvent,
	MessageDTO,
	ParticipantDTO,
} from "@chatty/shared-types";
import { Prisma } from "@prisma/client";
import { buildAvatarUrl } from "../../lib/avatar-storage.js";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getIO, userRoom } from "../../lib/socket-bus.js";
import { messageSelect, toMessageDTO, type MessageRow } from "../messages/messages.mapper.js";
import type {
	AddParticipantInput,
	CreateConversationInput,
	MarkReadInput,
	RenameConversationInput,
} from "./conversations.schema.js";

/** Shape returned by every query below, so one mapper can serve all of them. */
const conversationInclude = {
	participants: {
		select: {
			lastReadMessageId: true,
			user: { select: { id: true, handle: true, displayName: true, avatarUpdatedAt: true, createdAt: true } },
		},
	},
	messages: {
		take: 1,
		orderBy: { createdAt: "desc" },
		select: messageSelect,
	},
} as const;

interface ConversationRow {
	id: string;
	isGroup: boolean;
	name: string | null;
	updatedAt: Date;
	participants: {
		lastReadMessageId: string | null;
		user: { id: string; handle: string; displayName: string; avatarUpdatedAt: Date | null; createdAt: Date };
	}[];
	messages: MessageRow[];
}

/** Shared by every mapper below, so a participant looks the same everywhere one appears. */
function mapParticipants(rows: ConversationRow["participants"]): ParticipantDTO[] {
	return rows.map(({ user, lastReadMessageId }) => ({
		id: user.id,
		handle: user.handle,
		displayName: user.displayName,
		avatarUrl: buildAvatarUrl(user.id, user.avatarUpdatedAt),
		createdAt: user.createdAt.toISOString(),
		lastReadMessageId,
	}));
}

/**
 * `unreadCount` is passed in rather than read off the row because it is the one
 * field that differs per viewer: the same conversation is "3 unread" to one
 * participant and "0 unread" to the person who just wrote those three messages.
 */
function toConversationDTO(row: ConversationRow, unreadCount: number): ConversationDTO {
	const participants = mapParticipants(row.participants);

	const latest = row.messages[0];
	// Mapped by the messages module rather than here, so a message carries the
	// same fields in the sidebar as it does in the conversation — an attachment
	// on the newest message is the first thing that would have diverged.
	const lastMessage: MessageDTO | null = latest ? toMessageDTO(latest) : null;

	return {
		id: row.id,
		isGroup: row.isGroup,
		name: row.name,
		participants,
		lastMessage,
		unreadCount,
		updatedAt: row.updatedAt.toISOString(),
	};
}

/**
 * The broadcast-safe view of a conversation: everything `conversation:updated`
 * carries, and nothing it doesn't. See the type's own doc comment in
 * shared-types for why `unreadCount` and `lastMessage` are not in here — a
 * value that means something different to each recipient cannot go in a
 * payload sent to a whole room at once.
 */
function toConversationUpdatedEvent(row: ConversationRow): ConversationUpdatedEvent {
	return { conversationId: row.id, name: row.name, participants: mapParticipants(row.participants) };
}

interface UnreadCountRow {
	conversationId: string;
	unreadCount: number;
}

/**
 * How many messages the user has not read, per conversation.
 *
 * Raw SQL, and the reason is that every conversation has a *different*
 * boundary: the count runs from wherever that participant's marker sits.
 * Prisma's `groupBy` can count rows per conversation but cannot join each group
 * against its own cursor row, so expressing this through the query builder
 * means one query per conversation — a sidebar of thirty threads becoming
 * thirty round trips on every refresh.
 *
 * A conversation with nothing unread produces no row at all (there is nothing
 * to group), which is why callers default a miss to zero rather than trusting
 * the map to be complete.
 */
async function countUnreadByConversation(userId: string, conversationIds: string[]): Promise<Map<string, number>> {
	if (conversationIds.length === 0) return new Map();

	const rows = await prisma.$queryRaw<UnreadCountRow[]>`
		SELECT m."conversationId", COUNT(*)::int AS "unreadCount"
		FROM "Message" m
		JOIN "ConversationParticipant" p
			ON p."conversationId" = m."conversationId" AND p."userId" = ${userId}
		LEFT JOIN "Message" marker ON marker.id = p."lastReadMessageId"
		WHERE m."conversationId" IN (${Prisma.join(conversationIds)})
			AND m."authorId" <> ${userId}
			AND (marker.id IS NULL OR m."createdAt" > marker."createdAt")
		GROUP BY m."conversationId"
	`;

	return new Map(rows.map((row) => [row.conversationId, row.unreadCount]));
}

/**
 * Throws unless `userId` is a participant of `conversationId`.
 *
 * Lives here, in the module that owns participants, and is imported by every
 * other module that touches a conversation — messages, and the socket layer.
 * Not middleware: services are reachable from HTTP *and* from socket handlers,
 * so a check in Express middleware is a check the socket transport skips.
 *
 * NotFoundError, not UnauthorizedError: "you may not see this" confirms the
 * conversation exists, which lets an outsider probe for valid ids.
 */
export async function assertParticipant(userId: string, conversationId: string): Promise<void> {
	const participant = await prisma.conversationParticipant.findUnique({
		where: { conversationId_userId: { conversationId, userId } },
		select: { id: true },
	});

	if (!participant) throw new NotFoundError("Conversation not found");
}

/**
 * Finds an existing 1-1 conversation between exactly these two users.
 *
 * Without this, "message Minh" from two different screens creates two threads
 * and splits the history in half. Group conversations are deliberately NOT
 * deduplicated — the same set of people may legitimately want several groups.
 */
async function findExistingDirectConversation(userId: string, otherUserId: string): Promise<string | null> {
	const candidates = await prisma.conversation.findMany({
		where: {
			isGroup: false,
			AND: [{ participants: { some: { userId } } }, { participants: { some: { userId: otherUserId } } }],
		},
		select: { id: true, _count: { select: { participants: true } } },
	});

	// The AND above matches any conversation containing both users; a group that
	// happens to include them would qualify too, so require exactly two members.
	return candidates.find((candidate) => candidate._count.participants === 2)?.id ?? null;
}

/**
 * Adds every participant's already-connected sockets to the new conversation's room.
 *
 * Sockets join their conversation rooms once, at connect time. Without this,
 * someone who was already online when the conversation was created would sit in
 * a chat that never updates until they reload — the message is broadcast to a
 * room they are not in yet.
 *
 * Addressed via each user's personal room, so every tab and device they have
 * open is covered, not just the most recent one.
 */
async function subscribeParticipantsToRoom(participantIds: string[], conversationId: string): Promise<void> {
	const io = getIO();

	await Promise.all(participantIds.map((userId) => io.in(userRoom(userId)).socketsJoin(conversationId)));
}

/**
 * Tells every participant that a conversation now exists.
 *
 * Joining the room (above) only decides where future messages land. A new
 * conversation has none, so without this event it would stay invisible in the
 * sidebar until someone sent the first message — or until a reload.
 *
 * Addressed per user rather than to the conversation room so it reaches every
 * device they have open, including ones that just joined the room.
 *
 * One payload for everyone, including its per-viewer `unreadCount` — sound only
 * because a conversation this new has no messages, so that number is zero for
 * all of them. Anything sent here later that differs per participant would have
 * to be built per participant.
 */
function announceNewConversation(participantIds: string[], conversation: ConversationDTO): void {
	const io = getIO();

	for (const userId of participantIds) {
		io.to(userRoom(userId)).emit("conversation:new", conversation);
	}
}

/**
 * Drops one user's live sockets out of a conversation's room.
 *
 * The inverse of `subscribeParticipantsToRoom`, needed for the same reason in
 * reverse: room membership is what decides who a broadcast reaches, so a
 * removed participant whose sockets are still in the room would keep
 * receiving `message:new` for a conversation the database says they left.
 */
async function evictParticipantFromRoom(userId: string, conversationId: string): Promise<void> {
	await getIO().in(userRoom(userId)).socketsLeave(conversationId);
}

/**
 * Tells whoever is still in a conversation that its participants or name changed.
 *
 * To the conversation room, not per-user like `conversation:new` — everyone
 * left in it should see the same membership list, and by the time this fires
 * a removed participant's sockets have already been evicted from that room
 * (see `evictParticipantFromRoom`), so they do not receive it.
 */
function announceConversationUpdated(conversationId: string, event: ConversationUpdatedEvent): void {
	getIO().to(conversationId).emit("conversation:updated", event);
}

/**
 * Tells one user, on every device, that they are no longer in a conversation.
 *
 * Addressed to their personal room rather than the conversation room: their
 * sockets have just been evicted from that room, so it is the only channel
 * left that still reaches them.
 */
function announceParticipantLeft(userId: string, conversationId: string): void {
	getIO().to(userRoom(userId)).emit("conversation:left", { conversationId });
}

export async function createConversation(
	currentUserId: string,
	input: CreateConversationInput,
): Promise<ConversationDTO> {
	// Deduplicate, and drop the caller in case the client included them.
	const otherUserIds = [...new Set(input.participantIds)].filter((id) => id !== currentUserId);

	if (otherUserIds.length === 0) {
		throw new ValidationError("A conversation needs at least one other participant");
	}

	const existingUsers = await prisma.user.findMany({
		where: { id: { in: otherUserIds } },
		select: { id: true },
	});

	if (existingUsers.length !== otherUserIds.length) {
		throw new NotFoundError("One or more participants do not exist");
	}

	const isGroup = otherUserIds.length > 1;

	if (!isGroup) {
		const existingId = await findExistingDirectConversation(currentUserId, otherUserIds[0]!);

		if (existingId) {
			const existing = await prisma.conversation.findUniqueOrThrow({
				where: { id: existingId },
				include: conversationInclude,
			});
			// This branch returns a thread that may have years of history, so the
			// count is looked up rather than assumed to be zero the way it is below.
			const unreadCounts = await countUnreadByConversation(currentUserId, [existing.id]);

			return toConversationDTO(existing, unreadCounts.get(existing.id) ?? 0);
		}
	}

	const participantIds = [currentUserId, ...otherUserIds];

	// One statement, so a conversation can never exist without its participants.
	const conversation = await prisma.conversation.create({
		data: {
			isGroup,
			name: isGroup ? (input.name ?? null) : null,
			participants: {
				create: participantIds.map((userId) => ({ userId })),
			},
		},
		include: conversationInclude,
	});

	const conversationDTO = toConversationDTO(conversation, 0);

	// Join first, announce second. A client told about the conversation before
	// its socket is in the room could send a message and never see its own
	// broadcast come back.
	await subscribeParticipantsToRoom(participantIds, conversation.id);
	announceNewConversation(participantIds, conversationDTO);

	return conversationDTO;
}

export async function listConversationsForUser(userId: string): Promise<ConversationDTO[]> {
	const conversations = await prisma.conversation.findMany({
		where: { participants: { some: { userId } } },
		orderBy: { updatedAt: "desc" },
		include: conversationInclude,
	});

	const unreadCounts = await countUnreadByConversation(
		userId,
		conversations.map((conversation) => conversation.id),
	);

	return conversations.map((conversation) => toConversationDTO(conversation, unreadCounts.get(conversation.id) ?? 0));
}

/**
 * Moves the caller's read marker to `messageId`.
 *
 * Returns where the marker ended up, which is not always where the caller asked
 * for it — see the backwards check below. The client renders from the returned
 * event rather than from what it sent, so the two cannot disagree.
 */
export async function markConversationRead(
	currentUserId: string,
	conversationId: string,
	input: MarkReadInput,
): Promise<ConversationReadEvent> {
	await assertParticipant(currentUserId, conversationId);

	const message = await prisma.message.findUnique({
		where: { id: input.messageId },
		select: { id: true, conversationId: true, createdAt: true },
	});

	// Same error for "no such message" and "a message in someone else's
	// conversation", so this cannot be used to test whether an id exists.
	if (!message || message.conversationId !== conversationId) throw new NotFoundError("Message not found");

	const participant = await prisma.conversationParticipant.findUniqueOrThrow({
		where: { conversationId_userId: { conversationId, userId: currentUserId } },
		select: { lastReadMessageId: true },
	});

	if (participant.lastReadMessageId) {
		const currentMarker = await prisma.message.findUnique({
			where: { id: participant.lastReadMessageId },
			select: { createdAt: true },
		});

		// A marker only ever moves forward. Scrolling up loads older messages and
		// the client marks what it sees, so without this the marker would follow
		// the viewport backwards and a conversation someone had fully read would
		// turn unread again the moment they looked at its history.
		if (currentMarker && currentMarker.createdAt >= message.createdAt) {
			return { conversationId, userId: currentUserId, lastReadMessageId: participant.lastReadMessageId };
		}
	}

	await prisma.conversationParticipant.update({
		where: { conversationId_userId: { conversationId, userId: currentUserId } },
		data: { lastReadMessageId: message.id },
		select: { id: true },
	});

	const event: ConversationReadEvent = { conversationId, userId: currentUserId, lastReadMessageId: message.id };

	// To the room, so the author sees "Seen" appear without polling. The reader's
	// own other tabs are in that room too, which is what keeps a badge cleared on
	// the phone from staying lit on the laptop.
	getIO().to(conversationId).emit("conversation:read", event);

	return event;
}

/**
 * Everyone who shares at least one conversation with this user, themselves included.
 *
 * This is the audience for their presence, and the set whose presence they are
 * allowed to see. Broadcasting to everyone connected instead would tell every
 * account in the app who else is online — people they have no relationship with.
 */
export async function listContactIds(userId: string): Promise<string[]> {
	const memberships = await prisma.conversationParticipant.findMany({
		where: { conversation: { participants: { some: { userId } } } },
		select: { userId: true },
		distinct: ["userId"],
	});

	return memberships.map((membership) => membership.userId);
}

/**
 * Confirms a conversation is a group, or throws.
 *
 * Shared by every group-only operation below (add, remove, rename). A direct
 * conversation always has exactly its original two participants — the schema
 * comment on `Conversation.isGroup` already explains why that has to stay true
 * by construction: deriving it from a headcount instead would let a direct
 * chat that gained a third member silently become a group.
 *
 * Callers run `assertParticipant` first, which already confirms the row
 * exists — so a miss here can only mean `isGroup` is false, never "not found".
 */
async function assertGroup(conversationId: string): Promise<void> {
	const conversation = await prisma.conversation.findUnique({
		where: { id: conversationId },
		select: { isGroup: true },
	});

	if (!conversation?.isGroup) {
		throw new ValidationError("This operation is only available in a group conversation");
	}
}

/** Re-reads a conversation after a write, for the two shapes callers below need from it. */
async function reloadConversation(conversationId: string): Promise<ConversationRow> {
	return prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: conversationInclude });
}

/**
 * Adds one member to a group conversation.
 *
 * Returns the conversation as seen by the person who added them (their own
 * `unreadCount`, unaffected by this call) — the HTTP response an actor gets
 * for their own action. Everyone else learns about it from two different
 * socket events, not from this return value: the new member gets
 * `conversation:new`, which fixes a known gap — until now that event only
 * fired when a conversation was first created, so someone added to an
 * existing group never saw it appear in their sidebar until they reloaded.
 * Everyone already in the room gets `conversation:updated`.
 */
export async function addParticipant(
	currentUserId: string,
	conversationId: string,
	input: AddParticipantInput,
): Promise<ConversationDTO> {
	await assertParticipant(currentUserId, conversationId);
	await assertGroup(conversationId);

	const targetUser = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
	if (!targetUser) throw new NotFoundError("User not found");

	const alreadyIn = await prisma.conversationParticipant.findUnique({
		where: { conversationId_userId: { conversationId, userId: input.userId } },
		select: { id: true },
	});
	if (alreadyIn) throw new ConflictError("Already a participant of this conversation");

	await prisma.conversationParticipant.create({ data: { conversationId, userId: input.userId } });

	// Join first, announce second — same ordering as creating a conversation,
	// and for the same reason: told before their socket is in the room, the
	// new member could send a message and never see their own broadcast return.
	await subscribeParticipantsToRoom([input.userId], conversationId);

	const updated = await reloadConversation(conversationId);

	const newMemberUnread = await countUnreadByConversation(input.userId, [conversationId]);
	announceNewConversation([input.userId], toConversationDTO(updated, newMemberUnread.get(conversationId) ?? 0));

	announceConversationUpdated(conversationId, toConversationUpdatedEvent(updated));

	const actorUnread = await countUnreadByConversation(currentUserId, [conversationId]);
	return toConversationDTO(updated, actorUnread.get(conversationId) ?? 0);
}

/**
 * Removes one member from a group conversation — by someone else (a kick) or
 * by themselves (leaving). The two are the same operation: whoever is acting
 * must already be a participant either way, and the row that gets deleted is
 * the same row regardless of who asked.
 *
 * No HTTP response body: the actor and the target learn what happened from
 * socket events (`conversation:updated`, `conversation:left`), the same
 * write-over-HTTP-render-over-socket split the rest of the app already uses.
 *
 * The group is allowed to end up with zero participants. Nothing deletes a
 * conversation in this app — an empty group just becomes unreachable, the
 * same way a direct conversation is never destroyed either.
 */
export async function removeParticipant(
	currentUserId: string,
	conversationId: string,
	targetUserId: string,
): Promise<void> {
	await assertParticipant(currentUserId, conversationId);
	await assertGroup(conversationId);

	const target = await prisma.conversationParticipant.findUnique({
		where: { conversationId_userId: { conversationId, userId: targetUserId } },
		select: { id: true },
	});
	if (!target) throw new NotFoundError("Not a participant of this conversation");

	await prisma.conversationParticipant.delete({
		where: { conversationId_userId: { conversationId, userId: targetUserId } },
	});

	// Evict before announcing, not after: for the instant between the two
	// calls the departing socket would still be in the room and would receive
	// the very broadcast telling everyone else they are gone.
	await evictParticipantFromRoom(targetUserId, conversationId);
	announceParticipantLeft(targetUserId, conversationId);

	const remaining = await reloadConversation(conversationId);
	announceConversationUpdated(conversationId, toConversationUpdatedEvent(remaining));
}

/**
 * Renames a group conversation. Any current participant may do this — see
 * ADR 0006 for why the app has no separate admin role.
 */
export async function renameConversation(
	currentUserId: string,
	conversationId: string,
	input: RenameConversationInput,
): Promise<ConversationDTO> {
	await assertParticipant(currentUserId, conversationId);
	await assertGroup(conversationId);

	// `@updatedAt` bumps `Conversation.updatedAt` on this write, which moves the
	// conversation to the top of everyone's sidebar (sorted by that column).
	// Left as-is rather than overridden: a rename is exactly the kind of change
	// someone should notice, the same way sending a message bumps it.
	await prisma.conversation.update({
		where: { id: conversationId },
		data: { name: input.name },
		select: { id: true },
	});

	const updated = await reloadConversation(conversationId);
	announceConversationUpdated(conversationId, toConversationUpdatedEvent(updated));

	const actorUnread = await countUnreadByConversation(currentUserId, [conversationId]);
	return toConversationDTO(updated, actorUnread.get(conversationId) ?? 0);
}
