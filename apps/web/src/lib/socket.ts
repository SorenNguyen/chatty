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
		socket = io(SOCKET_URL, {
			auth: { token: getStoredToken() },
			/**
			 * WebSocket only, and this is a deployment decision rather than a
			 * preference.
			 *
			 * Socket.io's default is to open with HTTP long-polling and upgrade
			 * afterwards. Long-polling is a *sequence* of requests that must all
			 * reach the same process, and behind two instances without session
			 * affinity they do not: the handshake half-completes against one and the
			 * next poll lands on the other, which knows nothing about the session.
			 * It shows up as a reconnect loop that only appears once you scale out,
			 * and never on one machine.
			 *
			 * The Redis adapter does not fix this. It shares *rooms* between
			 * processes so a broadcast reaches everyone; it says nothing about which
			 * process a given request arrives at.
			 *
			 * The cost is any network that blocks WebSocket upgrades — a corporate
			 * proxy, an ancient captive portal — where this client cannot connect at
			 * all rather than falling back. That is the trade: a clear failure in a
			 * rare environment, over an intermittent one everywhere.
			 */
			transports: ["websocket"],
		});
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
