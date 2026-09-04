import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { verifyAccessToken } from "../lib/access-token.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { recordSocketConnected, recordSocketDisconnected, startSocketSetup } from "../lib/metrics.js";
import { setIO, userRoom, type ChattyServer, type ChattySocket } from "../lib/socket-bus.js";
import { listRealtimeConversationIds } from "../modules/blocks/blocks.service.js";
import { announceConnected, announceDisconnected, conversationRoomsOf } from "./presence.js";
import { registerTypingHandlers } from "./typing.js";

/**
 * Subscribes a socket to one room per conversation the user belongs to.
 *
 * Rooms are derived from the database on every connect rather than kept in a
 * map in memory: an in-memory map desynchronizes the moment a second server
 * process exists, and reconnects would silently stop delivering messages.
 */
async function joinConversationRooms(socket: ChattySocket, userId: string): Promise<void> {
	const conversationIds = await listRealtimeConversationIds(userId);

	// The personal room is how the conversation service reaches this user's live
	// sockets to add them to a conversation created after they connected.
	await socket.join([userRoom(userId), ...conversationIds]);
}

/**
 * Creates the Socket.io server and authenticates each connection with the same
 * JWT used for HTTP (see middlewares/requireAuth.ts).
 */
export function initSockets(httpServer: HttpServer): ChattyServer {
	const io: ChattyServer = new Server(httpServer, {
		cors: { origin: env.CORS_ORIGIN },
	});

	io.use((socket, next) => {
		const token = socket.handshake.auth.token as string | undefined;
		if (!token) return next(new Error("Missing auth token"));

		// The same function `requireAuth` uses, not a copy of it. The copy that
		// used to be here missed phase 4's attachment-token guard entirely.
		verifyAccessToken(token)
			.then((userId) => {
				socket.data.userId = userId;
				next();
			})
			.catch(() => next(new Error("Invalid or expired token")));
	});

	io.on("connection", (socket) => {
		const { userId } = socket.data;
		const stopSetupTimer = startSocketSetup();
		recordSocketConnected();

		// Rooms have to exist before either of the next two steps: typing checks
		// membership against them, and presence uses them as its audience.
		joinConversationRooms(socket, userId)
			.then(async () => {
				registerTypingHandlers(socket);
				await announceConnected(io, socket);
				stopSetupTimer("success");
				logger.info({ userId, socketId: socket.id }, "socket connected");
			})
			.catch((error: unknown) => {
				stopSetupTimer("error");
				// Without rooms this socket receives nothing, so fail loudly rather
				// than leaving the user silently staring at a chat that never updates.
				logger.error({ err: error, userId }, "failed to set up socket");
				socket.disconnect(true);
			});

		// Rooms are snapshotted here, not in "disconnect": by then the socket has
		// already left them, and presence would have no audience to notify.
		let roomsAtDisconnect: string[] = [];
		socket.on("disconnecting", () => {
			roomsAtDisconnect = conversationRoomsOf(socket);
		});

		socket.on("disconnect", (reason) => {
			recordSocketDisconnected(reason);
			announceDisconnected(io, userId, roomsAtDisconnect)
				.catch((error: unknown) => logger.error({ err: error, userId }, "failed to announce disconnect"))
				.finally(() => logger.info({ userId, socketId: socket.id }, "socket disconnected"));
		});
	});

	setIO(io);

	return io;
}
