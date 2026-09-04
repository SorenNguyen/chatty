import { userRoom, type ChattyServer, type ChattySocket } from "../lib/socket-bus.js";
import { listContactIds } from "../modules/conversations/conversations.service.js";
import { excludeRestrictedDirectRoomIds, listRestrictorsAmong } from "../modules/restrictions/restrictions.service.js";
import { prisma } from "../lib/prisma.js";

/**
 * Who is online, derived entirely from live connections.
 *
 * Live presence is never written down. A presence flag in the database is a lie
 * waiting to happen: the process that would clear it is exactly the one that
 * crashed. Only the disconnect timestamp is persisted for an approximate
 * “last seen”; asking the adapter who is online remains the source of truth.
 */

/**
 * The conversation rooms a socket is in.
 *
 * `socket.rooms` also contains the socket's own id (Socket.io puts every socket
 * in a room named after itself) and the personal room used to reach a user's
 * other devices. Neither is an audience for presence.
 */
export function conversationRoomsOf(socket: ChattySocket): string[] {
	const personalRoom = userRoom(socket.data.userId);

	return [...socket.rooms].filter((room) => room !== socket.id && room !== personalRoom);
}

/** How many live sockets this user has, across every tab, device and process. */
async function countConnections(io: ChattyServer, userId: string): Promise<number> {
	const sockets = await io.in(userRoom(userId)).fetchSockets();

	return sockets.length;
}

/**
 * Every user id with at least one live socket, in one adapter round trip.
 *
 * Asked this way — rather than by testing each contact's personal room — the
 * cost does not grow with how many people the user knows, and it keeps working
 * unchanged behind the Redis adapter that phase 5 needs for a second instance.
 */
async function listOnlineUserIds(io: ChattyServer): Promise<Set<string>> {
	const sockets = await io.fetchSockets();

	return new Set(sockets.map((socket) => socket.data.userId));
}

/**
 * Broadcasts to a set of rooms, skipping the call when the set is empty.
 *
 * The guard is not defensive tidiness. `io.to([])` narrows the broadcast to no
 * rooms at all, which Socket.io reads as "unrestricted" and delivers to every
 * connected client — so a user with no conversations would announce themselves
 * to the entire app.
 */
function emitPresence(
	io: ChattyServer,
	rooms: string[],
	userId: string,
	isOnline: boolean,
	lastSeenAt: string | null,
): void {
	if (rooms.length === 0) return;

	// One call with every room, so someone who shares three conversations with
	// this user is still told once — Socket.io deduplicates across the set.
	io.to(rooms).emit("presence:update", { userId, isOnline, lastSeenAt });
}

/**
 * Announces a user as online, and tells the new socket who already is.
 *
 * Only the *first* connection is news. Opening a second tab does not change
 * whether someone is reachable, and announcing it again would make every
 * refresh look like a reconnect to everyone watching.
 *
 * Must run after the socket has joined its conversation rooms: it reads them to
 * decide the audience, and reads its own presence out of the adapter.
 */
export async function announceConnected(io: ChattyServer, socket: ChattySocket): Promise<void> {
	const { userId } = socket.data;
	const connections = await countConnections(io, userId);

	if (connections === 1) {
		const rooms = await excludeRestrictedDirectRoomIds(userId, conversationRoomsOf(socket));
		emitPresence(io, rooms, userId, true, null);
	}

	// Sent to every connection, not just the first: a second tab needs the
	// picture as much as the first one did, and it has no other way to learn who
	// was already online before it opened.
	const [contactIds, onlineUserIds] = await Promise.all([listContactIds(userId), listOnlineUserIds(io)]);
	const onlineContactIds = contactIds.filter((contactId) => onlineUserIds.has(contactId));
	// The connect-time counterpart of the exclusion above: anyone who has
	// restricted this user is online exactly as far as they are concerned.
	const restrictors = await listRestrictorsAmong(userId, onlineContactIds);

	socket.emit("presence:snapshot", {
		// Filtered to people this user shares a conversation with. The unfiltered
		// list would tell every account who else is signed in, including strangers.
		onlineUserIds: onlineContactIds.filter((contactId) => !restrictors.has(contactId)),
	});
}

/**
 * Announces a user as offline once their last connection is gone.
 *
 * `rooms` is passed in because by the time a socket has disconnected it has
 * already left them, and there would be nobody left to tell. The caller
 * snapshots them during `disconnecting`, while they are still there.
 *
 * A refresh races this: the new socket may connect before the old one's count
 * is read. Either interleaving is safe — if the new socket has already joined,
 * the count is not zero and no offline is sent; if it has not, offline goes out
 * and the new connection immediately follows it with online.
 */
export async function announceDisconnected(io: ChattyServer, userId: string, rooms: string[]): Promise<void> {
	const connections = await countConnections(io, userId);

	// Another tab or device is still open — the person has not gone anywhere.
	if (connections > 0) return;

	const lastSeenAt = new Date();
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { presenceVisibility: true },
	});
	if (!user) return;
	await prisma.user.updateMany({ where: { id: userId }, data: { lastSeenAt } });

	const audibleRooms = await excludeRestrictedDirectRoomIds(userId, rooms);
	emitPresence(
		io,
		audibleRooms,
		userId,
		false,
		user.presenceVisibility === "NOBODY" ? null : lastSeenAt.toISOString(),
	);
}
