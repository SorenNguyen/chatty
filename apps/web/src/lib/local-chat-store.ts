import type { ConversationDTO, CurrentUserDTO, MessageDTO, MessageReplyDTO, UserDTO } from "@chatty/shared-types";

const DATABASE_NAME = "chatty-local";
const DATABASE_VERSION = 1;
const LAST_USER_KEY = "chatty:last-user-id";
const PROFILE_STORE = "profiles";
const CONVERSATION_STORE = "conversation-pages";
const MESSAGE_STORE = "message-snapshots";
const OUTBOX_STORE = "outbox";

const OFFLINE_IMAGE_URL =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 240'%3E%3Crect width='320' height='240' fill='%23e8e6e1'/%3E%3Cpath d='M88 174l48-55 31 34 22-24 43 45H88z' fill='%239c988f'/%3E%3Ccircle cx='205' cy='82' r='18' fill='%239c988f'/%3E%3C/svg%3E";
const OFFLINE_BINARY_URL = "data:application/octet-stream;base64,";

interface ConversationPageRecord {
	key: string;
	userId: string;
	isArchived: boolean;
	items: ConversationDTO[];
	hasMore: boolean;
}

interface MessageSnapshotRecord {
	key: string;
	userId: string;
	conversationId: string;
	messages: MessageDTO[];
}

export interface LocalOutboxAttachment {
	bytes: ArrayBuffer;
	name: string;
	type: string;
	lastModified: number;
	width: number | null;
	height: number | null;
}

export interface LocalOutboxMessage {
	id: string;
	userId: string;
	conversationId: string;
	author: UserDTO;
	content: string;
	replyTo: MessageReplyDTO | null;
	mentionedUserIds: string[];
	createdAt: string;
	attachments: LocalOutboxAttachment[];
}

let databasePromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
	if (!("indexedDB" in globalThis)) return Promise.resolve(null);
	if (databasePromise) return databasePromise;

	databasePromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains(PROFILE_STORE)) {
				database.createObjectStore(PROFILE_STORE, { keyPath: "id" });
			}
			for (const name of [CONVERSATION_STORE, MESSAGE_STORE, OUTBOX_STORE]) {
				if (database.objectStoreNames.contains(name)) continue;
				const store = database.createObjectStore(name, { keyPath: name === OUTBOX_STORE ? "id" : "key" });
				store.createIndex("by-user", "userId");
			}
			if (!request.transaction?.objectStore(OUTBOX_STORE).indexNames.contains("by-thread")) {
				request.transaction?.objectStore(OUTBOX_STORE).createIndex("by-thread", ["userId", "conversationId"]);
			}
		};
		request.onsuccess = () => {
			const database = request.result;
			database.onversionchange = () => {
				database.close();
				databasePromise = null;
			};
			resolve(database);
		};
		request.onerror = () => {
			databasePromise = null;
			reject(request.error);
		};
		request.onblocked = () => {
			databasePromise = null;
			reject(new Error("Local chat database is blocked by another tab"));
		};
	});

	return databasePromise;
}

async function readRecord<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
	const database = await openDatabase();
	if (!database) return null;

	return new Promise((resolve, reject) => {
		const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
		request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
		request.onerror = () => reject(request.error);
	});
}

async function putRecord(storeName: string, value: unknown): Promise<void> {
	const database = await openDatabase();
	if (!database) return;

	return new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, "readwrite");
		transaction.objectStore(storeName).put(value);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}

async function deleteRecord(storeName: string, key: IDBValidKey): Promise<void> {
	const database = await openDatabase();
	if (!database) return;

	return new Promise((resolve, reject) => {
		const transaction = database.transaction(storeName, "readwrite");
		transaction.objectStore(storeName).delete(key);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}

async function readIndex<T>(storeName: string, indexName: string, key: IDBValidKey): Promise<T[]> {
	const database = await openDatabase();
	if (!database) return [];

	return new Promise((resolve, reject) => {
		const request = database.transaction(storeName, "readonly").objectStore(storeName).index(indexName).getAll(key);
		request.onsuccess = () => resolve(request.result as T[]);
		request.onerror = () => reject(request.error);
	});
}

function pageKey(userId: string, isArchived: boolean): string {
	return `${userId}:${isArchived ? "archived" : "active"}`;
}

function snapshotKey(userId: string, conversationId: string): string {
	return `${userId}:${conversationId}`;
}

function withoutExpiringMedia(message: MessageDTO): MessageDTO {
	const stable = { ...message };
	delete stable.clientId;

	return {
		...stable,
		attachments: stable.attachments.map((attachment) => ({
			...attachment,
			url: attachment.kind === "image" ? OFFLINE_IMAGE_URL : OFFLINE_BINARY_URL,
			thumbUrl: null,
		})),
		replyTo: stable.replyTo ? { ...stable.replyTo, attachmentUrl: null } : null,
	};
}

export async function cacheCurrentUser(user: CurrentUserDTO): Promise<void> {
	localStorage.setItem(LAST_USER_KEY, user.id);
	await putRecord(PROFILE_STORE, user);
}

export async function readCachedCurrentUser(): Promise<CurrentUserDTO | null> {
	const userId = localStorage.getItem(LAST_USER_KEY);

	return userId ? readRecord<CurrentUserDTO>(PROFILE_STORE, userId) : null;
}

export async function cacheConversationPage(
	userId: string,
	isArchived: boolean,
	items: ConversationDTO[],
	hasMore: boolean,
): Promise<void> {
	await putRecord(CONVERSATION_STORE, {
		key: pageKey(userId, isArchived),
		userId,
		isArchived,
		items: items.map((conversation) => ({
			...conversation,
			lastMessage: conversation.lastMessage ? withoutExpiringMedia(conversation.lastMessage) : null,
		})),
		hasMore,
	} satisfies ConversationPageRecord);
}

export async function readConversationPage(
	userId: string,
	isArchived: boolean,
): Promise<{ items: ConversationDTO[]; hasMore: boolean } | null> {
	const record = await readRecord<ConversationPageRecord>(CONVERSATION_STORE, pageKey(userId, isArchived));

	return record ? { items: record.items, hasMore: record.hasMore } : null;
}

export async function cacheMessageSnapshot(
	userId: string,
	conversationId: string,
	messages: MessageDTO[],
): Promise<void> {
	await putRecord(MESSAGE_STORE, {
		key: snapshotKey(userId, conversationId),
		userId,
		conversationId,
		messages: messages.map(withoutExpiringMedia),
	} satisfies MessageSnapshotRecord);
}

export async function readMessageSnapshot(userId: string, conversationId: string): Promise<MessageDTO[]> {
	return (
		(await readRecord<MessageSnapshotRecord>(MESSAGE_STORE, snapshotKey(userId, conversationId)))?.messages ?? []
	);
}

export async function enqueueLocalMessage(message: LocalOutboxMessage): Promise<void> {
	await putRecord(OUTBOX_STORE, message);
}

export async function readLocalOutbox(userId: string, conversationId: string): Promise<LocalOutboxMessage[]> {
	const records = await readIndex<LocalOutboxMessage>(OUTBOX_STORE, "by-thread", [userId, conversationId]);

	return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function removeLocalMessage(messageId: string): Promise<void> {
	await deleteRecord(OUTBOX_STORE, messageId);
}

export async function clearLocalUserData(userId: string): Promise<void> {
	// A slow cleanup from one account must not erase the pointer written by a
	// different account that signed in while IndexedDB was opening.
	if (localStorage.getItem(LAST_USER_KEY) === userId) localStorage.removeItem(LAST_USER_KEY);
	const database = await openDatabase();
	if (!database) return;

	return new Promise((resolve, reject) => {
		const transaction = database.transaction(
			[PROFILE_STORE, CONVERSATION_STORE, MESSAGE_STORE, OUTBOX_STORE],
			"readwrite",
		);
		transaction.objectStore(PROFILE_STORE).delete(userId);
		for (const storeName of [CONVERSATION_STORE, MESSAGE_STORE, OUTBOX_STORE]) {
			const request = transaction.objectStore(storeName).index("by-user").openKeyCursor(userId);
			request.onsuccess = () => {
				const cursor = request.result;
				if (!cursor) return;
				transaction.objectStore(storeName).delete(cursor.primaryKey);
				cursor.continue();
			};
		}
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}
