import { z } from "zod";
import { userRoom, type ChattySocket } from "../lib/socket-bus.js";

/**
 * Typing is the one thing a client is allowed to push over the socket, so this
 * is the one place a socket payload is validated. `.safeParse`, not `.parse`,
 * unlike every HTTP boundary in the project: there is no error middleware on
 * this transport, so a throw here would take down the connection over a
 * malformed keystroke event instead of returning a 400.
 */
const typingSignalSchema = z.object({
	conversationId: z.string().min(1),
});

/**
 * Relays "X is typing" to the rest of a conversation.
 *
 * Nothing is persisted and nothing is read from the database — including the
 * membership check. `socket.rooms` already holds exactly the conversations this
 * user belongs to: the set is derived from the database when the socket
 * connects, and extended when a conversation is created for them. Consulting it
 * is a hash lookup, where a query would be a round trip several times a
 * sentence, to announce something that expires in seconds.
 *
 * The check is not optional, though. `socket.to(room)` addresses any room by
 * name, joined or not, so without it anyone could type into a stranger's chat.
 */
export function registerTypingHandlers(socket: ChattySocket): void {
	const { userId } = socket.data;

	function relay(isTyping: boolean) {
		return (signal: unknown) => {
			const parsed = typingSignalSchema.safeParse(signal);
			if (!parsed.success) return;

			const { conversationId } = parsed.data;
			if (!socket.rooms.has(conversationId)) return;

			// `socket.to` excludes the socket that sent this — but not the *person*.
			// Their other tabs and devices are in the same conversation room, so
			// without `.except` someone typing on their phone watches their own
			// laptop announce "Minh is typing…" back at them. The personal room
			// holds every socket one user has open, which is exactly the set to
			// leave out; presence uses it for the same reason.
			socket
				.to(conversationId)
				.except(userRoom(userId))
				.emit("typing:update", { conversationId, userId, isTyping });
		};
	}

	socket.on("typing:start", relay(true));
	socket.on("typing:stop", relay(false));
}
