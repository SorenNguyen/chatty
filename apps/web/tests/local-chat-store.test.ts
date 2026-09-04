import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
	cacheConversationPage,
	cacheCurrentUser,
	cacheMessageSnapshot,
	clearLocalUserData,
	enqueueLocalMessage,
	readCachedCurrentUser,
	readConversationPage,
	readLocalOutbox,
	readMessageSnapshot,
	removeLocalMessage,
} from "@/lib/local-chat-store";
import { makeConversation, makeCurrentUser, makeMessage } from "./factories";

describe("local chat store", () => {
	it("restores a profile, sidebar page, and recent messages without expiring media tokens", async () => {
		const user = makeCurrentUser({ id: "offline-reader" });
		const message = {
			...makeMessage("stored-message", "offline-reader", "on the train"),
			clientId: "draft:already-settled",
			attachments: [
				{
					id: "image-1",
					kind: "image" as const,
					url: "https://api.test/attachments/image-1?token=expires",
					thumbUrl: "https://api.test/attachments/image-1?size=thumb&token=expires",
					width: 320,
					height: 240,
					byteSize: 123,
					fileName: null,
					mediaType: "image/webp",
					durationMs: null,
					waveform: [],
				},
			],
		};
		const conversation = makeConversation({ id: "offline-thread", lastMessage: message });

		await cacheCurrentUser(user);
		await cacheConversationPage(user.id, false, [conversation], false);
		await cacheMessageSnapshot(user.id, conversation.id, [message]);

		await expect(readCachedCurrentUser()).resolves.toEqual(user);
		const page = await readConversationPage(user.id, false);
		expect(page?.items[0]?.lastMessage?.attachments[0]?.url).toMatch(/^data:image\/svg\+xml/);
		const snapshot = await readMessageSnapshot(user.id, conversation.id);
		expect(snapshot[0]).not.toHaveProperty("clientId");
		expect(snapshot[0]?.attachments[0]).toMatchObject({ id: "image-1", thumbUrl: null });
		expect(snapshot[0]?.attachments[0]?.url).not.toContain("token=");
	});

	it("keeps image bytes in an outbox until that exact send settles", async () => {
		const record = {
			id: "draft:offline",
			userId: "sender",
			conversationId: "thread",
			author: makeCurrentUser({ id: "sender" }),
			content: "queued",
			replyTo: null,
			mentionedUserIds: [],
			createdAt: "2026-09-04T10:00:00.000Z",
			attachments: [
				{
					bytes: new TextEncoder().encode("image bytes").buffer,
					name: "small.webp",
					type: "image/webp",
					lastModified: 123,
					width: 10,
					height: 20,
				},
			],
		};

		await enqueueLocalMessage(record);
		const queued = await readLocalOutbox("sender", "thread");
		expect(queued).toHaveLength(1);
		expect(queued[0]?.attachments[0]).toMatchObject({ name: "small.webp", width: 10, height: 20 });
		expect(queued[0]?.attachments[0]?.bytes.byteLength).toBe(11);

		await removeLocalMessage(record.id);
		await expect(readLocalOutbox("sender", "thread")).resolves.toEqual([]);
	});

	it("removes one signed-out user's local profile and chat data", async () => {
		const user = makeCurrentUser({ id: "signing-out" });
		await cacheCurrentUser(user);
		await cacheConversationPage(user.id, false, [makeConversation({ id: "private-thread" })], false);
		await clearLocalUserData(user.id);

		await expect(readCachedCurrentUser()).resolves.toBeNull();
		await expect(readConversationPage(user.id, false)).resolves.toBeNull();
	});

	it("does not erase a newer account pointer while an older account is being cleared", async () => {
		const previous = makeCurrentUser({ id: "previous-user" });
		const current = makeCurrentUser({ id: "current-user" });
		await cacheCurrentUser(previous);
		await cacheCurrentUser(current);

		await clearLocalUserData(previous.id);

		await expect(readCachedCurrentUser()).resolves.toEqual(current);
	});
});
