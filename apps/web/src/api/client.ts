import type {
	AddParticipantRequest,
	AuthResponse,
	ChangePasswordRequest,
	ChangePasswordResponse,
	ConfirmEmailChangeRequest,
	ConversationDTO,
	ConversationReadEvent,
	CurrentUserDTO,
	DeleteAccountRequest,
	EditMessageRequest,
	LoginRequest,
	MarkReadRequest,
	MessageDTO,
	MessageContextDTO,
	MessageEditDTO,
	MessageSearchPageDTO,
	ReactionKind,
	RegisterRequest,
	RenameConversationRequest,
	RequestEmailChangeRequest,
	RequestPasswordResetRequest,
	ResetPasswordRequest,
	ToggleReactionRequest,
	TransferOwnershipRequest,
	UpdateProfileRequest,
	UserDTO,
} from "@chatty/shared-types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const TOKEN_STORAGE_KEY = "chatty:token";

export function getStoredToken(): string | null {
	return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function storeToken(token: string): void {
	localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken(): void {
	localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * Thin fetch wrapper: attaches the base URL and Authorization header, and
 * throws on non-2xx so callers can `await` without checking `response.ok`.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const token = getStoredToken();
	// FormData sets its own Content-Type, and it has to: the header carries the
	// multipart boundary the browser generated. Declaring JSON over the top of it
	// makes the body unparseable on the server.
	const isFormData = options.body instanceof FormData;
	const response = await fetch(`${API_URL}${path}`, {
		...options,
		headers: {
			...(isFormData ? {} : { "Content-Type": "application/json" }),
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...options.headers,
		},
	});

	if (!response.ok) {
		// The server's error middleware sends { error, message }; fall back to the
		// status when the body is empty or not JSON (e.g. a proxy returned the error).
		const errorBody = await response.json().catch(() => ({}));
		throw new Error(errorBody.message ?? `Request to ${path} failed with ${response.status}`);
	}

	// A 204 has no body — removing a group member is the first endpoint that
	// answers this way. Calling .json() on an empty body throws, so this has to
	// be checked before every other caller of request<T>() can rely on it.
	if (response.status === 204) return undefined as T;

	return response.json() as Promise<T>;
}

function get<T>(path: string): Promise<T> {
	return request<T>(path);
}

function post<T>(path: string, body: unknown): Promise<T> {
	return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

/** Field names the server reads files from — see server middlewares/upload-image.ts. */
const AVATAR_FIELD = "avatar";
const ATTACHMENT_FIELD = "attachment";

/**
 * One named method per endpoint rather than raw get/post at the call site, so
 * the URL and its response type are declared once and every screen agrees.
 */
export const api = {
	register(input: RegisterRequest): Promise<AuthResponse> {
		return post<AuthResponse>("/auth/register", input);
	},

	login(input: LoginRequest): Promise<AuthResponse> {
		return post<AuthResponse>("/auth/login", input);
	},

	getCurrentUser(): Promise<CurrentUserDTO> {
		return get<CurrentUserDTO>("/users/me");
	},

	/**
	 * Changes your own display name, handle, or both, and returns the refreshed
	 * profile. Send only what changed — the server rejects a body with neither.
	 */
	updateProfile(input: UpdateProfileRequest): Promise<CurrentUserDTO> {
		return request<CurrentUserDTO>("/users/me", { method: "PATCH", body: JSON.stringify(input) });
	},

	/**
	 * Sets a new password and returns a replacement token.
	 *
	 * The replacement is not optional. Changing a password ends every session on
	 * the account, the caller's included, so the token this request was made with
	 * stops working the moment it returns. `useAuth.changePassword` is what
	 * stores it and reopens the socket — call that rather than this.
	 */
	changePassword(input: ChangePasswordRequest): Promise<ChangePasswordResponse> {
		return post<ChangePasswordResponse>("/auth/password", input);
	},

	/**
	 * Asks for a reset link. Answers 204 whether or not the address has an
	 * account, so a caller learns nothing about who is registered — which means
	 * the UI must not claim the mail was sent, only that it would have been.
	 */
	requestPasswordReset(input: RequestPasswordResetRequest): Promise<void> {
		return post<void>("/auth/password-reset", input);
	},

	/** Redeems a link from the email. One use, one hour. */
	resetPassword(input: ResetPasswordRequest): Promise<void> {
		return post<void>("/auth/password-reset/confirm", input);
	},

	/**
	 * Asks to move the account to a new address.
	 *
	 * **Nothing has changed when this resolves.** A link goes to the new address
	 * and the account moves only once it is opened, so the UI must say "check that
	 * inbox" rather than "email updated" — and the cached profile must not be
	 * touched. The old address is warned at the same time.
	 */
	requestEmailChange(input: RequestEmailChangeRequest): Promise<void> {
		return post<void>("/auth/email", input);
	},

	/** Redeems the link from the new mailbox. One use, one hour, no session required. */
	confirmEmailChange(input: ConfirmEmailChangeRequest): Promise<void> {
		return post<void>("/auth/email/confirm", input);
	},

	/**
	 * Deletes the signed-in account, permanently.
	 *
	 * The token this was sent with is dead on arrival of the response, so the
	 * caller has to clear it — `useAuth.deleteAccount` is what does that and drops
	 * the socket. Call that rather than this.
	 */
	deleteAccount(input: DeleteAccountRequest): Promise<void> {
		return request<void>("/users/me", { method: "DELETE", body: JSON.stringify(input) });
	},

	searchUsers(query: string): Promise<UserDTO[]> {
		return get<UserDTO[]>(`/users?query=${encodeURIComponent(query)}`);
	},

	listConversations(): Promise<ConversationDTO[]> {
		return get<ConversationDTO[]>("/conversations");
	},

	createConversation(participantIds: string[], name?: string): Promise<ConversationDTO> {
		return post<ConversationDTO>("/conversations", name ? { participantIds, name } : { participantIds });
	},

	/**
	 * Returns messages newest-first, so `limit` yields the most recent page.
	 * Pass `before` — the id of the oldest message already held — to walk further
	 * back. The cursor message itself is excluded.
	 */
	listMessages(
		conversationId: string,
		options: { limit: number; before?: string; after?: string },
	): Promise<MessageDTO[]> {
		const params = new URLSearchParams({ limit: String(options.limit) });
		if (options.before) params.set("before", options.before);
		if (options.after) params.set("after", options.after);

		return get<MessageDTO[]>(`/conversations/${conversationId}/messages?${params.toString()}`);
	},

	getMessageContext(conversationId: string, messageId: string, limit = 50): Promise<MessageContextDTO> {
		return get<MessageContextDTO>(
			`/conversations/${conversationId}/messages/${messageId}/context?limit=${String(limit)}`,
		);
	},

	listMessageEdits(conversationId: string, messageId: string): Promise<MessageEditDTO[]> {
		return get<MessageEditDTO[]>(`/conversations/${conversationId}/messages/${messageId}/edits`);
	},

	hideMessage(conversationId: string, messageId: string): Promise<void> {
		return request<void>(`/conversations/${conversationId}/messages/${messageId}/me`, { method: "DELETE" });
	},

	/**
	 * Sends a message, with an optional image.
	 *
	 * Same endpoint either way — JSON when it is only text, multipart when there
	 * is a file. One write path rather than two, so there is one place where
	 * membership is checked and one broadcast everyone renders from.
	 */
	sendMessage(
		conversationId: string,
		content: string,
		attachment?: File,
		onProgress?: (percent: number) => void,
		replyToId?: string,
	): Promise<MessageDTO> {
		const path = `/conversations/${conversationId}/messages`;
		if (!attachment) return post<MessageDTO>(path, { content, ...(replyToId ? { replyToId } : {}) });

		const body = new FormData();
		body.append(ATTACHMENT_FIELD, attachment);
		// Omitted rather than sent empty: an image with no caption is a message
		// with no text, and the server trims what it gets either way.
		if (content) body.append("content", content);
		// Multer puts non-file fields on `req.body`, so the same Zod schema reads
		// this whether the message arrived as JSON or as multipart.
		if (replyToId) body.append("replyToId", replyToId);

		return new Promise<MessageDTO>((resolve, reject) => {
			const upload = new XMLHttpRequest();
			upload.open("POST", `${API_URL}${path}`);
			const token = getStoredToken();

			if (token) upload.setRequestHeader("Authorization", `Bearer ${token}`);
			upload.upload.addEventListener("progress", (event) => {
				if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
			});
			upload.addEventListener("load", () => {
				if (upload.status >= 200 && upload.status < 300) {
					resolve(JSON.parse(upload.responseText) as MessageDTO);

					return;
				}

				const errorBody = JSON.parse(upload.responseText || "{}") as { message?: string };
				reject(new Error(errorBody.message ?? `Request to ${path} failed with ${upload.status}`));
			});
			upload.addEventListener("error", () => reject(new Error("The image upload was interrupted")));
			upload.send(body);
		});
	},

	/**
	 * Finds messages across every conversation you are in.
	 *
	 * Not scoped to one conversation on purpose — the point is not knowing which
	 * one the answer is in. Each result carries enough of its conversation to be
	 * labelled without a second request.
	 *
	 * Two characters minimum, enforced by the server: a one-character search
	 * matches most of the table and is never what anyone meant.
	 */
	searchMessages(
		query: string,
		limit = 20,
		conversationId?: string,
		before?: string,
		beforeId?: string,
	): Promise<MessageSearchPageDTO> {
		const params = new URLSearchParams({ query, limit: String(limit) });
		if (conversationId) params.set("conversationId", conversationId);
		if (before) params.set("before", before);
		if (beforeId) params.set("beforeId", beforeId);

		return get<MessageSearchPageDTO>(`/search/messages?${params.toString()}`);
	},

	/**
	 * Rewrites the text of a message you wrote. Only the author may, and only
	 * while it stands — a deleted message is refused rather than restored.
	 *
	 * Like `sendMessage`, the returned message is not what puts it on screen: the
	 * server broadcasts `message:updated` to everyone including the editor, so
	 * one code path renders the change for all of them.
	 */
	editMessage(conversationId: string, messageId: string, content: string): Promise<MessageDTO> {
		const body: EditMessageRequest = { content };

		return request<MessageDTO>(`/conversations/${conversationId}/messages/${messageId}`, {
			method: "PATCH",
			body: JSON.stringify(body),
		});
	},

	/**
	 * Deletes a message you wrote, and its image with it.
	 *
	 * Returns the tombstone rather than nothing: the message keeps its place in
	 * the conversation with its content emptied, which is what the list renders
	 * as "This message was deleted". Deleting twice is not an error.
	 */
	deleteMessage(conversationId: string, messageId: string): Promise<MessageDTO> {
		return request<MessageDTO>(`/conversations/${conversationId}/messages/${messageId}`, { method: "DELETE" });
	},

	/**
	 * Adds your reaction of this kind, or takes it off if it is already there.
	 *
	 * One call for both, so the caller never tracks which it is doing — the same
	 * button does both, and a client that decided for itself would disagree with
	 * the database the moment the same account reacted from a second tab.
	 *
	 * Like the other message writes, the response is not what renders it: the
	 * server broadcasts `message:updated` with the whole reaction list.
	 */
	toggleReaction(conversationId: string, messageId: string, kind: ReactionKind): Promise<MessageDTO> {
		const body: ToggleReactionRequest = { kind };

		return request<MessageDTO>(`/conversations/${conversationId}/messages/${messageId}/reactions`, {
			method: "PUT",
			body: JSON.stringify(body),
		});
	},

	/**
	 * Replaces the signed-in user's avatar. Returns the refreshed profile, whose
	 * `avatarUrl` carries a new version — assigning that to the store is what
	 * makes the picture change on screen rather than staying cached.
	 */
	uploadAvatar(file: File): Promise<CurrentUserDTO> {
		const body = new FormData();
		body.append(AVATAR_FIELD, file);

		return request<CurrentUserDTO>("/users/me/avatar", { method: "POST", body });
	},

	deleteAvatar(): Promise<CurrentUserDTO> {
		return request<CurrentUserDTO>("/users/me/avatar", { method: "DELETE" });
	},

	/**
	 * Moves the read marker to `messageId`.
	 *
	 * The response says where the marker actually ended up, which is not always
	 * where it was asked to go — the server refuses to move one backwards.
	 */
	markConversationRead(conversationId: string, messageId: string): Promise<ConversationReadEvent> {
		const body: MarkReadRequest = { messageId };

		return post<ConversationReadEvent>(`/conversations/${conversationId}/read`, body);
	},

	/**
	 * Adds someone to a group. Returns the conversation as seen by the caller —
	 * everyone else, including the new member, learns about it from the
	 * `conversation:new` / `conversation:updated` socket events instead.
	 */
	addParticipant(conversationId: string, userId: string): Promise<ConversationDTO> {
		const body: AddParticipantRequest = { userId };

		return post<ConversationDTO>(`/conversations/${conversationId}/members`, body);
	},

	/**
	 * Removes someone from a group, or — pass your own id — leaves it. No
	 * return value: the server answers 204 and the UI updates from
	 * `conversation:updated` / `conversation:left` once the socket event lands,
	 * the same write-over-HTTP-render-over-socket split used everywhere else.
	 */
	removeParticipant(conversationId: string, userId: string): Promise<void> {
		return request<void>(`/conversations/${conversationId}/members/${userId}`, { method: "DELETE" });
	},

	/**
	 * Hands a group to another member. Owner only, and the caller stops being the
	 * owner in the same request — there is exactly one.
	 *
	 * Returns the conversation as the (now former) owner sees it; everyone else
	 * learns about it from `conversation:updated` and the system line.
	 */
	transferOwnership(conversationId: string, userId: string): Promise<ConversationDTO> {
		const body: TransferOwnershipRequest = { userId };

		return request<ConversationDTO>(`/conversations/${conversationId}/owner`, {
			method: "PUT",
			body: JSON.stringify(body),
		});
	},

	renameConversation(conversationId: string, name: string): Promise<ConversationDTO> {
		const body: RenameConversationRequest = { name };

		return request<ConversationDTO>(`/conversations/${conversationId}`, {
			method: "PATCH",
			body: JSON.stringify(body),
		});
	},
};
