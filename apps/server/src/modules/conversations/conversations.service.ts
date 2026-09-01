import type {
	ConversationDTO,
	ConversationReadEvent,
	ConversationSelfUpdatedEvent,
	ConversationUpdatedEvent,
	MessageDTO,
	ParticipantDTO,
} from "@chatty/shared-types";
import { Prisma, type ConversationRole as DbConversationRole } from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getIO, userRoom } from "../../lib/socket-bus.js";
import { messageSelect, toMessageDTO, type MessageRow } from "../messages/messages.mapper.js";
import { toUserDTO, userSelect, type UserRow } from "../users/users.mapper.js";
import type {
	AddParticipantInput,
	ArchiveConversationInput,
	CreateConversationInput,
	MarkReadInput,
	MuteConversationInput,
	PinConversationInput,
	RenameConversationInput,
	TransferOwnershipInput,
} from "./conversations.schema.js";

const MAX_PINNED_CONVERSATIONS = 5;

/** Shape returned by every query below, so one mapper can serve all of them. */
const conversationInclude = {
	participants: {
		select: {
			// The shared marker, not `lastReadMessageId`. Nothing that leaves this
			// process reads the private one — see `mapParticipants`.
			lastSharedReadMessageId: true,
			role: true,
			archivedAt: true,
			pinnedAt: true,
			mutedUntil: true,
			user: { select: userSelect },
		},
	},
	messages: {
		take: 1,
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		select: messageSelect,
	},
	pinnedMessages: {
		orderBy: { pinnedAt: "desc" },
		select: {
			messageId: true,
			pinnedAt: true,
			pinnedById: true,
			message: { select: { content: true } },
		},
	},
} satisfies Prisma.ConversationInclude;

function conversationIncludeForUser(userId: string) {
	return {
		participants: conversationInclude.participants,
		pinnedMessages: conversationInclude.pinnedMessages,
		messages: {
			...conversationInclude.messages,
			where: { hiddenFor: { none: { userId } } },
		},
	} satisfies Prisma.ConversationInclude;
}

interface ConversationRow {
	id: string;
	isGroup: boolean;
	name: string | null;
	updatedAt: Date;
	participants: {
		lastSharedReadMessageId: string | null;
		role: DbConversationRole;
		archivedAt: Date | null;
		pinnedAt: Date | null;
		mutedUntil: Date | null;
		user: UserRow;
	}[];
	messages: MessageRow[];
	pinnedMessages: {
		messageId: string;
		pinnedAt: Date;
		pinnedById: string;
		message: { content: string };
	}[];
}

/**
 * Shared by every mapper below, so a participant looks the same everywhere one appears.
 *
 * `lastReadMessageId` on the wire is fed by `lastSharedReadMessageId` in the
 * database, and that substitution is the entire server side of "turn read
 * receipts off". A participant who has turned them off has no shared marker, so
 * there is nothing here to filter out per viewer and nothing a broadcast can
 * leak — the value simply is not in the row this reads. See the schema comment
 * on the column.
 */
function mapParticipants(rows: ConversationRow["participants"]): ParticipantDTO[] {
	return rows.map(({ user, lastSharedReadMessageId, role }) => ({
		...toUserDTO(user, true),
		role: role === "OWNER" ? "owner" : "member",
		lastReadMessageId: lastSharedReadMessageId,
	}));
}

/**
 * `unreadCount` is passed in rather than read off the row because it is the one
 * field that differs per viewer: the same conversation is "3 unread" to one
 * participant and "0 unread" to the person who just wrote those three messages.
 */
function toConversationDTO(row: ConversationRow, unreadCount: number, viewerId: string): ConversationDTO {
	const participants = mapParticipants(row.participants);
	const viewer = row.participants.find((participant) => participant.user.id === viewerId);

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
		isPinned: viewer?.pinnedAt !== null && viewer?.pinnedAt !== undefined,
		isArchived: viewer?.archivedAt !== null && viewer?.archivedAt !== undefined,
		mutedUntil: viewer?.mutedUntil?.toISOString() ?? null,
		pinnedMessages: row.pinnedMessages.map((pinned) => ({
			messageId: pinned.messageId,
			content: pinned.message.content,
			pinnedAt: pinned.pinnedAt.toISOString(),
			pinnedById: pinned.pinnedById,
		})),
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
 *
 * System messages are never counted — a badge on the sidebar means "someone said
 * something to you", and "Chi left the group" is not that. It used to fall out of
 * the SQL for free, because `authorId` was null only on a system line and
 * `null <> $userId` is null rather than true. Deleting an account ended that: a
 * USER message can now outlive its author and have a null `authorId` too, and
 * reading it as a system line would quietly stop counting the messages of
 * everyone who ever left. `kind` is the discriminator, so the filter says so.
 *
 * Deleted messages are not counted either, and that one *is* special-cased.
 * A tombstone has no content left to read, so a badge pointing at it sends
 * someone to look at "This message was deleted". The row still has to be here
 * for the marker join below — which is the whole reason a delete is a tombstone
 * rather than a DELETE.
 *
 * **Unread starts when you joined, not when the conversation did.** Without the
 * `joinedAt` bound, being added to a group with five years of history lit the
 * badge with all of it: a new participant's marker is null, and a null marker
 * means "has read nothing", which is true and useless. It is bounded for
 * everyone rather than only for new joiners, because that is one rule instead of
 * two — for the people who were there at the start `joinedAt` is the moment the
 * conversation was created, so nothing predates it and nothing changes.
 *
 * `>=`, not `>`, and it is not an off-by-one. Both columns are millisecond
 * timestamps written by the application, so a message sent in the same
 * millisecond as somebody joining is a genuine tie — and it is a tie in tests
 * constantly, where a fixture creates a conversation and sends into it in one
 * breath. Counting that message is the friendlier way to be wrong: the reader
 * sees something they may already have known about, rather than never being told
 * about a message at all.
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
			AND m."kind" = 'USER'
			AND m."authorId" IS DISTINCT FROM ${userId}
			AND m."deletedAt" IS NULL
			AND NOT EXISTS (
				SELECT 1 FROM "MessageHiddenFor" h
				WHERE h."messageId" = m.id AND h."userId" = ${userId}
			)
			AND m."createdAt" >= p."joinedAt"
			AND (marker.id IS NULL OR (m."createdAt", m.id) > (marker."createdAt", marker.id))
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
type ParticipantReader = Pick<Prisma.TransactionClient, "conversationParticipant">;

export async function assertParticipant(
	userId: string,
	conversationId: string,
	database: ParticipantReader = prisma,
): Promise<void> {
	const participant = await database.conversationParticipant.findUnique({
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
				include: conversationIncludeForUser(currentUserId),
			});
			// This branch returns a thread that may have years of history, so the
			// count is looked up rather than assumed to be zero the way it is below.
			const unreadCounts = await countUnreadByConversation(currentUserId, [existing.id]);

			return toConversationDTO(existing, unreadCounts.get(existing.id) ?? 0, currentUserId);
		}
	}

	const participantIds = [currentUserId, ...otherUserIds];

	// One statement, so a conversation can never exist without its participants.
	const conversation = await prisma.conversation.create({
		data: {
			isGroup,
			name: isGroup ? (input.name ?? null) : null,
			participants: {
				// The creator of a group owns it. In a direct conversation everyone
				// stays a member: the role only decides who may act on *other*
				// people, and there is nobody to administer between two — see
				// ADR 0008.
				create: participantIds.map((userId) => ({
					userId,
					...(isGroup && userId === currentUserId ? { role: "OWNER" as const } : {}),
				})),
			},
		},
		include: conversationInclude,
	});

	const conversationDTO = toConversationDTO(conversation, 0, currentUserId);

	// Join first, announce second. A client told about the conversation before
	// its socket is in the room could send a message and never see its own
	// broadcast come back.
	await subscribeParticipantsToRoom(participantIds, conversation.id);
	announceNewConversation(participantIds, conversationDTO);

	return conversationDTO;
}

export async function listConversationsForUser(userId: string, isArchived = false): Promise<ConversationDTO[]> {
	const memberships = await prisma.conversationParticipant.findMany({
		where: { userId, ...(isArchived ? { archivedAt: { not: null } } : { archivedAt: null }) },
		// Ordered by the viewer's own membership row, so the database—not each
		// client—defines the stable pin order. Nulls last keeps every ordinary row
		// below all pinned rows before activity breaks ties.
		orderBy: [{ pinnedAt: { sort: "desc", nulls: "last" } }, { conversation: { updatedAt: "desc" } }],
		select: { conversation: { include: conversationIncludeForUser(userId) } },
	});
	const conversations = memberships.map((membership) => membership.conversation);

	const unreadCounts = await countUnreadByConversation(
		userId,
		conversations.map((conversation) => conversation.id),
	);

	return conversations.map((conversation) =>
		toConversationDTO(conversation, unreadCounts.get(conversation.id) ?? 0, userId),
	);
}

function toConversationSelfUpdatedEvent(row: {
	conversationId: string;
	pinnedAt: Date | null;
	archivedAt: Date | null;
	mutedUntil: Date | null;
}): ConversationSelfUpdatedEvent {
	return {
		conversationId: row.conversationId,
		isPinned: row.pinnedAt !== null,
		isArchived: row.archivedAt !== null,
		mutedUntil: row.mutedUntil?.toISOString() ?? null,
	};
}

function announceConversationSelfUpdated(userId: string, event: ConversationSelfUpdatedEvent): void {
	getIO().to(userRoom(userId)).emit("conversation:self-updated", event);
}

const selfStateSelect = {
	conversationId: true,
	pinnedAt: true,
	archivedAt: true,
	mutedUntil: true,
} as const;

export async function setConversationArchived(
	userId: string,
	conversationId: string,
	input: ArchiveConversationInput,
): Promise<ConversationSelfUpdatedEvent> {
	await assertParticipant(userId, conversationId);
	const participant = await prisma.conversationParticipant.update({
		where: { conversationId_userId: { conversationId, userId } },
		data: {
			archivedAt: input.archived ? new Date() : null,
			// A row cannot be intentionally prominent and hidden at once.
			...(input.archived ? { pinnedAt: null } : {}),
		},
		select: selfStateSelect,
	});
	const event = toConversationSelfUpdatedEvent(participant);
	announceConversationSelfUpdated(userId, event);

	return event;
}

export async function setConversationPinned(
	userId: string,
	conversationId: string,
	input: PinConversationInput,
): Promise<ConversationSelfUpdatedEvent> {
	await assertParticipant(userId, conversationId);
	const participant = await prisma.$transaction(async (transaction) => {
		await transaction.$queryRaw`
			SELECT id FROM "ConversationParticipant"
			WHERE "userId" = ${userId}
			FOR UPDATE
		`;
		if (input.pinned) {
			const pinnedCount = await transaction.conversationParticipant.count({
				where: { userId, pinnedAt: { not: null }, conversationId: { not: conversationId } },
			});
			if (pinnedCount >= MAX_PINNED_CONVERSATIONS) {
				throw new ValidationError(`You can pin up to ${MAX_PINNED_CONVERSATIONS} conversations`);
			}
		}

		return transaction.conversationParticipant.update({
			where: { conversationId_userId: { conversationId, userId } },
			data: {
				pinnedAt: input.pinned ? new Date() : null,
				...(input.pinned ? { archivedAt: null } : {}),
			},
			select: selfStateSelect,
		});
	});
	const event = toConversationSelfUpdatedEvent(participant);
	announceConversationSelfUpdated(userId, event);

	return event;
}

export async function setConversationMuted(
	userId: string,
	conversationId: string,
	input: MuteConversationInput,
): Promise<ConversationSelfUpdatedEvent> {
	await assertParticipant(userId, conversationId);
	const until = input.until ? new Date(input.until) : null;
	if (until && until.getTime() <= Date.now()) throw new ValidationError("Mute end time must be in the future");

	const participant = await prisma.conversationParticipant.update({
		where: { conversationId_userId: { conversationId, userId } },
		data: { mutedUntil: until },
		select: selfStateSelect,
	});
	const event = toConversationSelfUpdatedEvent(participant);
	announceConversationSelfUpdated(userId, event);

	return event;
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
		select: { lastReadMessageId: true, user: { select: { readReceiptsEnabled: true } } },
	});
	const areReceiptsShared = participant.user.readReceiptsEnabled;

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
		data: {
			lastReadMessageId: message.id,
			// The private marker always moves — clearing your own badge is nobody
			// else's business. The shared one moves only when receipts are on, so a
			// reader who has turned them off leaves no record anywhere of how far
			// they got.
			...(areReceiptsShared && { lastSharedReadMessageId: message.id }),
		},
		select: { id: true },
	});

	const event: ConversationReadEvent = { conversationId, userId: currentUserId, lastReadMessageId: message.id };

	if (areReceiptsShared) {
		// To the room, so the author sees "Seen" appear without polling. The reader's
		// own other tabs are in that room too, which is what keeps a badge cleared on
		// the phone from staying lit on the laptop.
		getIO().to(conversationId).emit("conversation:read", event);
	} else {
		// Only this reader's own devices. They still need the badge cleared on the
		// laptop when they read on the phone; nobody else gets told anything, which
		// is the same promise the unwritten shared marker makes.
		getIO().to(userRoom(currentUserId)).emit("conversation:read", event);
	}

	return event;
}

/**
 * Withdraws every read receipt this user has given, everywhere.
 *
 * Called when they turn receipts off. Leaving the shared markers where they are
 * would keep yesterday's "Seen" on other people's screens after a setting that
 * says otherwise — and the markers are what the DTO reads, so clearing them is
 * the whole of it.
 *
 * The broadcast is what makes it visible now rather than after a reload:
 * `conversation:updated` already carries every participant's marker, so it is
 * the event that says "these are the markers, forget what you had". One emit per
 * conversation, on an action nobody performs twice in a day.
 *
 * Exported for `users.service`, which owns the setting; the conversation-shaped
 * half of it belongs here for the same reason `assertParticipant` does.
 */
export async function clearSharedReadMarkers(userId: string): Promise<void> {
	const memberships = await prisma.conversationParticipant.findMany({
		where: { userId, lastSharedReadMessageId: { not: null } },
		select: { conversationId: true },
	});
	if (memberships.length === 0) return;

	await prisma.conversationParticipant.updateMany({
		where: { userId },
		data: { lastSharedReadMessageId: null },
	});

	const conversations = await prisma.conversation.findMany({
		where: { id: { in: memberships.map((membership) => membership.conversationId) } },
		include: conversationInclude,
	});

	for (const conversation of conversations) {
		announceConversationUpdated(conversation.id, toConversationUpdatedEvent(conversation));
	}
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
 * Serialises a group mutation, then confirms its actor and target kind.
 *
 * Shared by every group-only operation below (add, remove, rename). A direct
 * conversation always has exactly its original two participants — the schema
 * comment on `Conversation.isGroup` already explains why that has to stay true
 * by construction: deriving it from a headcount instead would let a direct
 * chat that gained a third member silently become a group.
 *
 * Membership is checked only after the lock, so a concurrent leave cannot pass
 * authorization against a row that disappears before the write.
 */
async function prepareGroupMutation(
	transaction: Prisma.TransactionClient,
	userId: string,
	conversationId: string,
): Promise<void> {
	// Every membership or name mutation takes the same row lock first. It makes
	// two requests for one group happen in a stable order — most importantly an
	// owner leaving at the same time as their likely successor. Without it, one
	// request can promote a participant the other request has just removed.
	const conversations = await transaction.$queryRaw<{ isGroup: boolean }[]>`
		SELECT "isGroup"
		FROM "Conversation"
		WHERE id = ${conversationId}
		FOR UPDATE
	`;

	await assertParticipant(userId, conversationId, transaction);

	if (!conversations[0]?.isGroup) {
		throw new ValidationError("This operation is only available in a group conversation");
	}
}

/**
 * Throws unless `userId` owns `conversationId`.
 *
 * Guards the two operations that act on *other* people — renaming the group
 * everyone sees, and removing someone from it. Leaving is deliberately not one
 * of them: it acts on yourself, and a group whose owner could trap people in it
 * would be a worse answer than an ownerless one.
 *
 * ForbiddenError, not NotFoundError: unlike `assertParticipant`, the caller is
 * already known to be in this conversation, so there is nothing left to hide by
 * pretending it does not exist — and a 404 would leave the UI unable to explain
 * why the button did nothing.
 */
async function assertOwner(
	transaction: Prisma.TransactionClient,
	userId: string,
	conversationId: string,
): Promise<void> {
	const participant = await transaction.conversationParticipant.findUnique({
		where: { conversationId_userId: { conversationId, userId } },
		select: { role: true },
	});

	if (participant?.role !== "OWNER") throw new ForbiddenError("Only the group owner can do this");
}

/**
 * The display names behind a list of user ids, in the order they were asked for.
 *
 * One query for however many names a sentence needs, and positional so the
 * caller can destructure it — `const [actorName, targetName] = ...` reads as
 * the sentence it is about to build.
 *
 * A missing id falls back to "Someone" rather than throwing. Nothing deletes
 * users today, so this is unreachable; the day something does, a group log that
 * says "Someone added Binh" is a better outcome than an add that fails at the
 * last step with the row already written.
 */
async function displayNamesOf(transaction: Prisma.TransactionClient, userIds: string[]): Promise<string[]> {
	const users = await transaction.user.findMany({
		where: { id: { in: userIds } },
		select: { id: true, displayName: true },
	});
	const byId = new Map(users.map((user) => [user.id, user.displayName]));

	return userIds.map((userId) => byId.get(userId) ?? "Someone");
}

/**
 * Writes one "An added Binh" line inside the caller's transaction.
 *
 * A real Message row, not a client-side annotation on `conversation:updated`:
 * it has to survive a reload, sit in order among the messages around it, and
 * still be there when someone scrolls back a week. The sentence is rendered
 * here, once, and stored — see ADR 0009 for why it is a snapshot of the names
 * rather than ids resolved at read time.
 *
 * Written here rather than by calling `messages.service`, which is
 * where a message-sending function would otherwise belong: that module already
 * imports `assertParticipant` from this one, and importing it back would close
 * the cycle `messages.mapper` exists to keep open.
 */
async function createSystemMessage(
	transaction: Prisma.TransactionClient,
	conversationId: string,
	content: string,
): Promise<MessageRow> {
	const message = await transaction.message.create({
		data: { conversationId, kind: "SYSTEM", content },
		select: messageSelect,
	});

	// Same transaction, and the same reason `sendMessage` uses one: a
	// conversation whose `updatedAt` disagrees with its newest message sorts
	// wrongly in every sidebar from then on.
	await transaction.conversation.update({
		where: { id: conversationId },
		data: { updatedAt: new Date() },
		select: { id: true },
	});

	return message;
}

/** Socket effects happen only after the database transaction has committed. */
function announceSystemMessage(message: MessageRow): void {
	getIO().to(message.conversationId).emit("message:new", toMessageDTO(message));
}

/**
 * Hands a group to its longest-standing remaining member, and says so in the log.
 *
 * Called when an owner leaves. Without it the group would be left with nobody
 * able to rename it or remove anyone, and no path in the app that could ever
 * grant the role again — every group needs an owner for the same reason it
 * needed one on day one.
 *
 * Oldest membership wins, ties broken by id, which is the same ordering the
 * backfill in the role migration used. Arbitrary but stable: any rule picks
 * someone who did not ask for it, and this one at least picks the person who
 * has been there longest.
 */
async function transferOwnership(
	transaction: Prisma.TransactionClient,
	conversationId: string,
): Promise<MessageRow | null> {
	const successor = await transaction.conversationParticipant.findFirst({
		where: { conversationId },
		orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
		select: { id: true, user: { select: { displayName: true } } },
	});

	// The last person out of a group leaves nobody to promote. Allowed: nothing
	// in this app deletes a conversation, and an empty one is simply unreachable.
	if (!successor) return null;

	await transaction.conversationParticipant.update({
		where: { id: successor.id },
		data: { role: "OWNER" },
		select: { id: true },
	});

	return createSystemMessage(transaction, conversationId, `${successor.user.displayName} is now the group owner`);
}

/** Re-reads a conversation after a write, for the two shapes callers below need from it. */
async function reloadConversation(
	transaction: Prisma.TransactionClient,
	conversationId: string,
): Promise<ConversationRow> {
	return transaction.conversation.findUniqueOrThrow({
		where: { id: conversationId },
		include: conversationInclude,
	});
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
 *
 * **Any member may do this, owner or not** — unlike renaming and removing.
 * Inviting is how a group grows, gating it behind one person makes them a
 * bottleneck for the thing groups exist to do, and the worst case (an unwanted
 * arrival) is one the owner can undo. See ADR 0008.
 */
export async function addParticipant(
	currentUserId: string,
	conversationId: string,
	input: AddParticipantInput,
): Promise<ConversationDTO> {
	const { systemMessage, updated } = await prisma.$transaction(async (transaction) => {
		await prepareGroupMutation(transaction, currentUserId, conversationId);

		const targetUser = await transaction.user.findUnique({ where: { id: input.userId }, select: { id: true } });
		if (!targetUser) throw new NotFoundError("User not found");

		const alreadyIn = await transaction.conversationParticipant.findUnique({
			where: { conversationId_userId: { conversationId, userId: input.userId } },
			select: { id: true },
		});
		if (alreadyIn) throw new ConflictError("Already a participant of this conversation");

		await transaction.conversationParticipant.create({ data: { conversationId, userId: input.userId } });

		const [actorName, targetName] = await displayNamesOf(transaction, [currentUserId, input.userId]);
		const message = await createSystemMessage(transaction, conversationId, `${actorName} added ${targetName}`);
		const conversation = await reloadConversation(transaction, conversationId);

		return { systemMessage: message, updated: conversation };
	});

	// Database state is committed before socket state changes. Join before any
	// announcement so the new member receives the same message:new event as the
	// people who were already in the room.
	await subscribeParticipantsToRoom([input.userId], conversationId);
	announceSystemMessage(systemMessage);

	const newMemberUnread = await countUnreadByConversation(input.userId, [conversationId]);
	announceNewConversation(
		[input.userId],
		toConversationDTO(updated, newMemberUnread.get(conversationId) ?? 0, input.userId),
	);

	announceConversationUpdated(conversationId, toConversationUpdatedEvent(updated));

	const actorUnread = await countUnreadByConversation(currentUserId, [conversationId]);
	return toConversationDTO(updated, actorUnread.get(conversationId) ?? 0, currentUserId);
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
 *
 * **Removing someone else is owner-only; removing yourself is always allowed.**
 * That asymmetry is the whole of what the role does here — see ADR 0008 — and
 * an owner who walks out hands the group to whoever has been in it longest
 * rather than leaving it with nobody able to administer it.
 */
export async function removeParticipant(
	currentUserId: string,
	conversationId: string,
	targetUserId: string,
): Promise<void> {
	const isLeaving = targetUserId === currentUserId;
	const { systemMessages, remaining } = await prisma.$transaction(async (transaction) => {
		await prepareGroupMutation(transaction, currentUserId, conversationId);
		if (!isLeaving) await assertOwner(transaction, currentUserId, conversationId);

		const target = await transaction.conversationParticipant.findUnique({
			where: { conversationId_userId: { conversationId, userId: targetUserId } },
			select: { id: true, role: true, user: { select: { displayName: true } } },
		});
		if (!target) throw new NotFoundError("Not a participant of this conversation");

		await transaction.conversationParticipant.delete({
			where: { conversationId_userId: { conversationId, userId: targetUserId } },
		});

		const messages: MessageRow[] = [];
		if (isLeaving) {
			messages.push(
				await createSystemMessage(transaction, conversationId, `${target.user.displayName} left the group`),
			);
		} else {
			const [actorName] = await displayNamesOf(transaction, [currentUserId]);
			messages.push(
				await createSystemMessage(
					transaction,
					conversationId,
					`${actorName} removed ${target.user.displayName}`,
				),
			);
		}

		// After the departure line, so the persisted log reads in the order the
		// transition happened. Both writes still commit or roll back together.
		if (target.role === "OWNER") {
			const ownershipMessage = await transferOwnership(transaction, conversationId);
			if (ownershipMessage) messages.push(ownershipMessage);
		}

		return {
			systemMessages: messages,
			remaining: await reloadConversation(transaction, conversationId),
		};
	});

	// Socket effects follow the commit. Eviction still comes before broadcasts,
	// so the removed user cannot receive the system lines about their departure.
	await evictParticipantFromRoom(targetUserId, conversationId);
	announceParticipantLeft(targetUserId, conversationId);
	for (const message of systemMessages) announceSystemMessage(message);
	announceConversationUpdated(conversationId, toConversationUpdatedEvent(remaining));
}

/**
 * Renames a group conversation. **Owner only** — the name is the one piece of
 * a group everybody sees, and it is what a sidebar row is recognised by. See
 * ADR 0008.
 */
export async function renameConversation(
	currentUserId: string,
	conversationId: string,
	input: RenameConversationInput,
): Promise<ConversationDTO> {
	const { systemMessage, updated } = await prisma.$transaction(async (transaction) => {
		await prepareGroupMutation(transaction, currentUserId, conversationId);
		await assertOwner(transaction, currentUserId, conversationId);

		// `@updatedAt` bumps `Conversation.updatedAt` on this write, which moves the
		// conversation to the top of everyone's sidebar (sorted by that column).
		await transaction.conversation.update({
			where: { id: conversationId },
			data: { name: input.name },
			select: { id: true },
		});

		const [actorName] = await displayNamesOf(transaction, [currentUserId]);
		const message = await createSystemMessage(
			transaction,
			conversationId,
			`${actorName} renamed the group to "${input.name}"`,
		);

		return { systemMessage: message, updated: await reloadConversation(transaction, conversationId) };
	});

	announceSystemMessage(systemMessage);
	announceConversationUpdated(conversationId, toConversationUpdatedEvent(updated));

	const actorUnread = await countUnreadByConversation(currentUserId, [conversationId]);
	return toConversationDTO(updated, actorUnread.get(conversationId) ?? 0, currentUserId);
}

/**
 * Hands a group to another member who is still in it. **Owner only.**
 *
 * The gap ADR 0008 left open: until now the role moved in exactly one
 * circumstance — the owner walking out — so an owner who wanted to stay in the
 * group and stop administering it had no way to say so, and a group whose owner
 * had gone quiet had no way to get a new one.
 *
 * Two writes, and the order is not arbitrary. The partial unique index on
 * `(conversationId) WHERE role = 'OWNER'` refuses a second owner *per statement*,
 * so the demotion has to land first; the deferred constraint trigger then allows
 * the moment in between where the group has none, and re-checks at commit. That
 * pairing is exactly what the phase 7 migration's own comment said it was for.
 *
 * Two hand-overs racing each other are settled before either gets that far: both
 * take the `Conversation` row lock in `prepareGroupMutation`, and whichever
 * arrives second finds it is no longer the owner and is refused with a 403. A
 * clean failure rather than the constraint violation — a 500 — the invariant
 * would otherwise produce.
 */
export async function transferGroupOwnership(
	currentUserId: string,
	conversationId: string,
	input: TransferOwnershipInput,
): Promise<ConversationDTO> {
	const { systemMessage, updated } = await prisma.$transaction(async (transaction) => {
		await prepareGroupMutation(transaction, currentUserId, conversationId);
		await assertOwner(transaction, currentUserId, conversationId);

		if (input.userId === currentUserId) {
			throw new ValidationError("You already own this group");
		}

		const target = await transaction.conversationParticipant.findUnique({
			where: { conversationId_userId: { conversationId, userId: input.userId } },
			select: { id: true, user: { select: { displayName: true } } },
		});
		// NotFound rather than Validation: from the caller's side this is "no such
		// member here", the same answer `removeParticipant` gives.
		if (!target) throw new NotFoundError("Not a participant of this conversation");

		await transaction.conversationParticipant.update({
			where: { conversationId_userId: { conversationId, userId: currentUserId } },
			data: { role: "MEMBER" },
			select: { id: true },
		});
		await transaction.conversationParticipant.update({
			where: { id: target.id },
			data: { role: "OWNER" },
			select: { id: true },
		});

		const [actorName] = await displayNamesOf(transaction, [currentUserId]);
		const message = await createSystemMessage(
			transaction,
			conversationId,
			`${actorName} made ${target.user.displayName} the group owner`,
		);

		return { systemMessage: message, updated: await reloadConversation(transaction, conversationId) };
	});

	announceSystemMessage(systemMessage);
	announceConversationUpdated(conversationId, toConversationUpdatedEvent(updated));

	const actorUnread = await countUnreadByConversation(currentUserId, [conversationId]);
	return toConversationDTO(updated, actorUnread.get(conversationId) ?? 0, currentUserId);
}

/**
 * Takes a user out of every conversation they are in, inside the caller's transaction.
 *
 * The conversation-shaped half of deleting an account. It lives here rather than
 * in `users.service` because it is made entirely of this module's invariants —
 * the owner rule, the system log, the room bookkeeping — and none of them should
 * be reimplemented by whoever happens to be deleting the row.
 *
 * Takes the transaction rather than opening one, so the departures and the delete
 * of the user itself are one commit. Half of this having happened is a person who
 * has left four groups and still has an account.
 *
 * Direct conversations are left alone: there is nobody to promote and nothing to
 * announce, and the participant row goes with the user by cascade. The messages
 * stay in both cases — see the `Message.authorId` schema comment.
 *
 * Returns what has to be broadcast *after* the commit, because a socket event is
 * not transactional and an event about a transaction that rolls back is a lie.
 */
export interface DepartureEffects {
	systemMessages: MessageRow[];
	conversations: ConversationRow[];
}

export async function removeUserFromEveryGroup(
	transaction: Prisma.TransactionClient,
	userId: string,
	displayName: string,
): Promise<DepartureEffects> {
	const memberships = await transaction.conversationParticipant.findMany({
		where: { userId, conversation: { isGroup: true } },
		select: { conversationId: true, role: true },
	});

	const systemMessages: MessageRow[] = [];
	const conversations: ConversationRow[] = [];

	for (const membership of memberships) {
		const { conversationId } = membership;
		// The same row lock every other membership change takes, so a deletion and
		// a concurrent kick or hand-over on the same group happen in one order.
		await transaction.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE`;

		await transaction.conversationParticipant.delete({
			where: { conversationId_userId: { conversationId, userId } },
		});

		// The name is captured before the row goes, and it is the last time this
		// person is named anywhere: their surviving messages lose the author
		// entirely. A group that watched somebody vanish with no line in the log
		// would be the one membership change ADR 0009 does not record.
		systemMessages.push(
			await createSystemMessage(transaction, conversationId, `${displayName} deleted their account`),
		);

		if (membership.role === "OWNER") {
			const ownershipMessage = await transferOwnership(transaction, conversationId);
			if (ownershipMessage) systemMessages.push(ownershipMessage);
		}

		conversations.push(await reloadConversation(transaction, conversationId));
	}

	return { systemMessages, conversations };
}

/** Broadcasts what `removeUserFromEveryGroup` did, once its transaction has committed. */
export function announceDepartures(effects: DepartureEffects): void {
	for (const message of effects.systemMessages) announceSystemMessage(message);
	for (const conversation of effects.conversations) {
		announceConversationUpdated(conversation.id, toConversationUpdatedEvent(conversation));
	}
}
