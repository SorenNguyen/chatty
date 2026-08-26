/**
 * Types that cross the wire between apps/server and apps/web.
 * Keep these in sync with prisma/schema.prisma by hand — Prisma's generated
 * types live only in the server; these are the trimmed-down "safe to send
 * to a client" shapes (e.g. no password hashes).
 */

/** Another user, as shown to you — a conversation participant, a message author. */
export interface UserDTO {
	id: string;
	/**
	 * Unique, lowercase, public. Display names are not unique, so this is what
	 * tells two people with the same name apart in a search result.
	 */
	handle: string;
	displayName: string;
	/**
	 * Absolute URL of the user's avatar, or null when they have not set one.
	 *
	 * Derived by the server, never stored: the database keeps only
	 * `avatarUpdatedAt`, and this URL is built from it as
	 * `{PUBLIC_URL}/users/{id}/avatar?v={timestamp}`. Two consequences worth
	 * knowing on the client side:
	 *
	 * - It is safe to cache hard. The `v` changes the moment the picture does,
	 *   so a stale image cannot survive an upload.
	 * - It is stable across storage backends. Moving the files from local disk
	 *   to S3 changes nothing here, because no row ever held a storage path.
	 */
	avatarUrl: string | null;
	createdAt: string; // ISO 8601
}

/**
 * Your own account. Separate from UserDTO because `email` belongs to you and
 * must never ride along on someone else's profile — keeping them as one type
 * makes that leak a one-character mistake.
 */
export interface CurrentUserDTO extends UserDTO {
	email: string;
}

/**
 * A user seen through their membership of one conversation.
 *
 * Extends UserDTO rather than replacing it, so anything that only needs the
 * profile (a title, an avatar) keeps accepting a participant unchanged.
 */
export interface ParticipantDTO extends UserDTO {
	/**
	 * The newest message this participant has read, or null if they never have.
	 *
	 * Enough to render "Seen" without a second request: a message is read by
	 * someone when it is at or before their marker. The client compares by
	 * position in the loaded list rather than by timestamp, because ids are what
	 * the server commits to.
	 */
	lastReadMessageId: string | null;
}

export interface ConversationDTO {
	id: string;
	isGroup: boolean;
	name: string | null; // null for 1-1 conversations; derived from participants on the client
	participants: ParticipantDTO[];
	lastMessage: MessageDTO | null;
	/**
	 * Messages in this conversation, written by someone else, newer than the
	 * viewer's read marker. Computed per viewer, so it is only meaningful in a
	 * response to the person who asked.
	 */
	unreadCount: number;
	updatedAt: string;
}

/**
 * An image sent with a message.
 *
 * `width` and `height` are the stored image's, after the server's re-encode —
 * not the original's. They are here so the message list can reserve the right
 * space before the picture has loaded; without them every arriving image shoves
 * the conversation around as it decodes.
 */
export interface AttachmentDTO {
	id: string;
	/**
	 * Absolute, and **signed and short-lived** — unlike `UserDTO.avatarUrl`,
	 * which is public and cached forever.
	 *
	 * An attachment is private content inside a conversation, and an `<img>` tag
	 * cannot send an Authorization header, so the proof rides in the URL: the
	 * server mints a token only in a response whose membership it has already
	 * checked. Two consequences on the client side:
	 *
	 * - **Do not persist it.** It expires, and a stored copy becomes a broken
	 *   image. Re-fetch the message to get a fresh one.
	 * - **It is not an identity.** The token is re-minted on every read, so the
	 *   same image can arrive under a different URL each time — though not
	 *   reliably so, since a JWT's `iat` has one-second resolution and two reads
	 *   in the same second produce the same string. Sometimes-stable is the worst
	 *   case for anything keyed on it: a cache, a React `key`, a dedupe. Key on
	 *   `id`.
	 */
	url: string;
	width: number;
	height: number;
	byteSize: number;
}

export interface MessageDTO {
	id: string;
	conversationId: string;
	authorId: string;
	/** Empty string for a message that is only an image. */
	content: string;
	attachment: AttachmentDTO | null;
	createdAt: string;
}

// ---- Auth request/response contracts ----
//
// Declared here rather than separately on each side. When these lived only in
// the client and only in the server's Zod schema, adding a required field to
// one left the other compiling happily and failing at runtime with a 400.

export interface RegisterRequest {
	email: string;
	password: string;
	handle: string;
	displayName: string;
}

export interface LoginRequest {
	email: string;
	password: string;
}

export interface AuthResponse {
	token: string;
	user: Pick<CurrentUserDTO, "id" | "email" | "handle" | "displayName">;
}

/**
 * Body of `PATCH /users/me`.
 *
 * Both fields are optional and the server requires at least one — a PATCH that
 * changes nothing is a mistake worth reporting, not a no-op to absorb quietly.
 * Sending only the field that changed is also what keeps two tabs from
 * overwriting each other's edit of the other field.
 *
 * `email` is deliberately not here. Changing it has to prove the new address is
 * reachable, which needs the same outbound-email machinery as password reset —
 * see the roadmap's phase 3 item 10.
 */
export interface UpdateProfileRequest {
	// `| undefined` is required, not noise: the server compiles with
	// `exactOptionalPropertyTypes`, under which `displayName?: string` means the
	// key may be absent but must never hold `undefined` — and that is exactly
	// what a Zod `.partial()` produces for a field the client left out.
	displayName?: string | undefined;
	handle?: string | undefined;
}

/**
 * Body of `POST /auth/password`.
 *
 * `currentPassword` is required even though the request is already
 * authenticated: a token is proof of a past sign-in, and this endpoint is the
 * one that decides whether every future one still works. Someone who walks up
 * to an unlocked laptop has the token but not the password.
 *
 * There is no response body — see the note on session lifetime in
 * `auth.service.ts#changePassword`.
 */
export interface ChangePasswordRequest {
	currentPassword: string;
	newPassword: string;
}

/**
 * Body of `POST /conversations/:id/read`.
 *
 * Carries the message id rather than a timestamp: the client already knows
 * which message is on screen, and a clock it controls is not something the
 * server should trust to decide what has been read.
 */
export interface MarkReadRequest {
	messageId: string;
}

/**
 * Body of `POST /conversations/:conversationId/messages`.
 *
 * Sent as JSON for a text message, or as multipart with the file in an
 * `attachment` field when there is an image — in which case `content` is the
 * optional caption. One of the two must carry something: the server rejects a
 * request with neither.
 */
export interface SendMessageRequest {
	content?: string | undefined;
}

/** Body of `POST /conversations/:id/members`. */
export interface AddParticipantRequest {
	userId: string;
}

/** Body of `PATCH /conversations/:id`. Group-only — the server rejects it for a direct conversation. */
export interface RenameConversationRequest {
	name: string;
}

// ---- Socket.io event contracts ----
//
// Wired into the Socket.io server as `Server<ClientToServerEvents, ServerToClientEvents>`
// and into the client as `io<ServerToClientEvents, ClientToServerEvents>`, so a payload
// that does not match fails to compile on both ends instead of arriving malformed.

/** Someone advanced their read marker in a conversation you are in. */
export interface ConversationReadEvent {
	conversationId: string;
	userId: string;
	lastReadMessageId: string;
}

/** Someone started or stopped typing in a conversation you are in. */
export interface TypingEvent {
	conversationId: string;
	userId: string;
	isTyping: boolean;
}

/** Someone you share a conversation with connected or dropped their last connection. */
export interface PresenceEvent {
	userId: string;
	isOnline: boolean;
}

/**
 * Who is already online, sent once to a socket right after it connects.
 *
 * Without it a client only learns about presence when it *changes*, so everyone
 * who was already online before you opened the app would look offline until
 * they happened to reconnect.
 */
export interface PresenceSnapshotEvent {
	onlineUserIds: string[];
}

/** What the client sends to say it is or is no longer typing. */
export interface TypingSignal {
	conversationId: string;
}

/**
 * Participants or the name changed in a conversation you are in — someone was
 * added, someone left or was removed, or the group was renamed.
 *
 * Carries only the parts of a conversation that are *not* specific to who is
 * watching. `unreadCount` and `lastMessage` are deliberately absent: they are
 * per-viewer, and one broadcast to a room cannot correctly answer "unread to
 * whom?" for every recipient at once — see `ConversationDTO.unreadCount`.
 * Each participant's own `lastReadMessageId` rides along because that *is* a
 * fact about them, not about the recipient, the same reasoning `conversation:read`
 * already relies on.
 */
export interface ConversationUpdatedEvent {
	conversationId: string;
	name: string | null;
	participants: ParticipantDTO[];
}

/**
 * You were removed from a conversation, or you left it yourself.
 *
 * Sent to your personal room rather than the conversation room: by the time
 * this fires your socket has already been evicted from that room, so it is
 * the only way left to reach you — and it reaches every tab and device you
 * have open, the same as `conversation:new`.
 */
export interface ConversationLeftEvent {
	conversationId: string;
}

/** Events the server pushes down. The client only listens to these. */
export interface ServerToClientEvents {
	"message:new": (message: MessageDTO) => void;
	/**
	 * Someone started a conversation that includes you.
	 *
	 * Needed because joining the room is not enough: a brand-new conversation has
	 * no messages, so nothing would ever be broadcast into it and it would not
	 * appear in the sidebar until the other person happened to send something —
	 * or until a reload.
	 *
	 * Sent to the creator too. Their UI already has the conversation from the
	 * HTTP response, so the client de-duplicates by id; one payload for everyone
	 * beats a second code path that only the creator exercises.
	 */
	"conversation:new": (conversation: ConversationDTO) => void;
	"conversation:read": (event: ConversationReadEvent) => void;
	"conversation:updated": (event: ConversationUpdatedEvent) => void;
	"conversation:left": (event: ConversationLeftEvent) => void;
	"typing:update": (event: TypingEvent) => void;
	"presence:update": (event: PresenceEvent) => void;
	"presence:snapshot": (event: PresenceSnapshotEvent) => void;
}

/**
 * Events the client sends up.
 *
 * Deliberately short, and typing is the only thing on it. Everything that
 * *persists* — sending a message, marking a conversation read — goes over HTTP
 * and comes back to everyone as a server event, so there is one write path to
 * secure and the sender renders from the same event everyone else does.
 *
 * Typing is the exception that proves the rule: it is not written anywhere, it
 * fires several times a sentence, and it is worthless a few seconds later. Put
 * on HTTP it would be a request per keystroke, each with its own round trip and
 * auth check, to update something that expires before it lands.
 */
export interface ClientToServerEvents {
	"typing:start": (signal: TypingSignal) => void;
	"typing:stop": (signal: TypingSignal) => void;
}
