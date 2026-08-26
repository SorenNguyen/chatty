import type { ClientToServerEvents, ServerToClientEvents } from "@chatty/shared-types";
import { io, type Socket } from "socket.io-client";
import { getStoredToken } from "@/api/client";

const SOCKET_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type ChattySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ChattySocket | undefined;

/**
 * The app's single socket connection, authenticated with the same token as REST
 * calls (the server verifies `handshake.auth.token` — see server/sockets/index.ts).
 *
 * Created lazily so it reads the token *after* login rather than at module load,
 * when there is nothing stored yet.
 */
export function getSocket(): ChattySocket {
	if (!socket) {
		socket = io(SOCKET_URL, { auth: { token: getStoredToken() } });
	}

	return socket;
}

/**
 * Drops the connection and forgets it, so the next `getSocket()` re-authenticates
 * with whatever token is stored then. Called on logout: a socket opened with the
 * previous user's token would keep delivering their messages after a switch.
 */
export function closeSocket(): void {
	socket?.disconnect();
	socket = undefined;
}
