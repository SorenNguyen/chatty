import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { blockUser, getBlockStatus, listBlockedUsers, unblockUser } from "../src/modules/blocks/blocks.service.js";
import { createConversation, markConversationRead } from "../src/modules/conversations/conversations.service.js";
import {
	editMessage,
	sendMessage,
	setMessagePinned,
	toggleReaction,
} from "../src/modules/messages/messages.service.js";
import { searchUsers } from "../src/modules/users/users.service.js";
import { installFakeIO } from "./fake-io.js";

async function makeUser(handle: string) {
	return prisma.user.create({
		data: {
			email: `${handle}@test.com`,
			handle,
			displayName: handle,
			passwordHash: "x",
		},
		select: { id: true },
	});
}

let mai: { id: string };
let linh: { id: string };

beforeEach(async () => {
	// Every path here broadcasts, so the bus has to exist even though most cases
	// below do not assert on what went over it.
	installFakeIO();
	mai = await makeUser("mai");
	linh = await makeUser("linh");
});

describe("blocking", () => {
	it("refuses a direct conversation in both directions", async () => {
		await blockUser(mai.id, linh.id);

		await expect(createConversation(mai.id, { participantIds: [linh.id] })).rejects.toThrow(
			"This conversation is unavailable",
		);
		// The person who was blocked is refused too, and told the same thing —
		// a different message is how they would confirm they had been blocked.
		await expect(createConversation(linh.id, { participantIds: [mai.id] })).rejects.toThrow(
			"This conversation is unavailable",
		);
	});

	/**
	 * The case a creation-time check alone would miss, and the reason the real
	 * enforcement is in `sendMessage`: two people who have been talking for months
	 * already have their conversation, so guarding creation would stop nothing.
	 */
	it("stops messages in a conversation that already existed", async () => {
		const conversation = await createConversation(mai.id, { participantIds: [linh.id] });
		await sendMessage(mai.id, conversation.id, { content: "before" });

		await blockUser(linh.id, mai.id);

		await expect(sendMessage(mai.id, conversation.id, { content: "after" })).rejects.toThrow(
			"This conversation is unavailable",
		);
		await expect(sendMessage(linh.id, conversation.id, { content: "after" })).rejects.toThrow(
			"This conversation is unavailable",
		);
	});

	it("leaves a group both of them are in alone", async () => {
		const other = await makeUser("binh");
		const group = await createConversation(mai.id, { participantIds: [linh.id, other.id] });

		await blockUser(mai.id, linh.id);

		// The answer WhatsApp, Messenger and Telegram all give. A placeholder in a
		// shared room is Discord's, and makes one thread read differently for two
		// people in it.
		await expect(sendMessage(mai.id, group.id, { content: "still fine" })).resolves.toBeTruthy();
		await expect(sendMessage(linh.id, group.id, { content: "still fine" })).resolves.toBeTruthy();
	});

	it("withdraws cached presence immediately unless a shared group still makes it visible", async () => {
		const directConversation = await createConversation(mai.id, { participantIds: [linh.id] });
		const directOnlyBus = installFakeIO();

		await blockUser(mai.id, linh.id);

		expect(directOnlyBus.leaves).toEqual(
			expect.arrayContaining([
				{ fromRoom: `user:${mai.id}`, leftRoom: directConversation.id },
				{ fromRoom: `user:${linh.id}`, leftRoom: directConversation.id },
			]),
		);
		expect(directOnlyBus.emits).toEqual(
			expect.arrayContaining([
				{
					room: `user:${mai.id}`,
					event: "presence:update",
					payload: { userId: linh.id, isOnline: false, lastSeenAt: null },
				},
				{
					room: `user:${linh.id}`,
					event: "presence:update",
					payload: { userId: mai.id, isOnline: false, lastSeenAt: null },
				},
			]),
		);

		await unblockUser(mai.id, linh.id);
		const binh = await makeUser("binh");
		await createConversation(mai.id, { participantIds: [linh.id, binh.id] });
		const sharedGroupBus = installFakeIO();
		await blockUser(mai.id, linh.id);

		expect(sharedGroupBus.emits).not.toContainEqual(expect.objectContaining({ event: "presence:update" }));
	});

	it("refuses every recipient-visible direct interaction but keeps reads private", async () => {
		const conversation = await createConversation(mai.id, { participantIds: [linh.id] });
		const message = await sendMessage(mai.id, conversation.id, { content: "before" });
		await blockUser(linh.id, mai.id);

		await expect(editMessage(mai.id, conversation.id, message.id, { content: "after" })).rejects.toThrow(
			"This conversation is unavailable",
		);
		await expect(setMessagePinned(mai.id, conversation.id, message.id, true)).rejects.toThrow(
			"This conversation is unavailable",
		);
		await expect(toggleReaction(mai.id, conversation.id, message.id, { emoji: "❤️" })).rejects.toThrow(
			"This conversation is unavailable",
		);

		// Reading is still allowed to clear the reader's own badge, but a block
		// suppresses the shared marker so unblocking cannot reveal a later read.
		await expect(markConversationRead(mai.id, conversation.id, { messageId: message.id })).resolves.toMatchObject({
			lastReadMessageId: message.id,
		});
		const marker = await prisma.conversationParticipant.findUniqueOrThrow({
			where: { conversationId_userId: { conversationId: conversation.id, userId: mai.id } },
			select: { lastReadMessageId: true, lastSharedReadMessageId: true },
		});
		expect(marker).toEqual({ lastReadMessageId: message.id, lastSharedReadMessageId: null });
	});

	it("hides each from the other's search, both ways", async () => {
		await expect(searchUsers(mai.id, { query: "linh", limit: 10 })).resolves.toHaveLength(1);

		await blockUser(mai.id, linh.id);

		await expect(searchUsers(mai.id, { query: "linh", limit: 10 })).resolves.toEqual([]);
		// The half that matters: being blocked also takes you out of *their*
		// results, so they cannot find you and be refused with no explanation.
		await expect(searchUsers(linh.id, { query: "mai", limit: 10 })).resolves.toEqual([]);
	});

	it("is idempotent, and unblocking restores contact", async () => {
		await blockUser(mai.id, linh.id);
		await expect(blockUser(mai.id, linh.id)).resolves.toBeUndefined();
		await expect(listBlockedUsers(mai.id, { limit: 30 })).resolves.toMatchObject({
			items: [{ id: linh.id }],
			nextCursor: null,
		});

		await unblockUser(mai.id, linh.id);

		await expect(listBlockedUsers(mai.id, { limit: 30 })).resolves.toEqual({ items: [], nextCursor: null });
		await expect(createConversation(mai.id, { participantIds: [linh.id] })).resolves.toBeTruthy();
	});

	it("refuses to block yourself", async () => {
		await expect(blockUser(mai.id, mai.id)).rejects.toThrow("You cannot block yourself");
	});

	/**
	 * The account, not the tab, is what has blocked somebody. Without this a
	 * second session keeps offering "Block" for a person already blocked, and
	 * holds a composer disabled after the block was lifted on a phone.
	 */
	it("tells the actor's other sessions, and only theirs", async () => {
		const bus = installFakeIO();
		await blockUser(mai.id, linh.id);

		expect(bus.emits).toContainEqual({
			room: `user:${mai.id}`,
			event: "block:changed",
			payload: { userId: linh.id, isBlocked: true },
		});
		// The arrival of an event is itself a timing signal, so the blocked person
		// gets nothing at all — not even the `false` that is true of their own row.
		expect(bus.emits.filter((emit) => emit.event === "block:changed").map((emit) => emit.room)).toEqual([
			`user:${mai.id}`,
		]);

		await unblockUser(mai.id, linh.id);

		expect(bus.emits).toContainEqual({
			room: `user:${mai.id}`,
			event: "block:changed",
			payload: { userId: linh.id, isBlocked: false },
		});
	});

	it("reports only the caller's own block state", async () => {
		await blockUser(mai.id, linh.id);

		await expect(getBlockStatus(mai.id, linh.id)).resolves.toEqual({ isBlocked: true });
		// The blocked person cannot use status as an oracle for the reverse direction.
		await expect(getBlockStatus(linh.id, mai.id)).resolves.toEqual({ isBlocked: false });
		await expect(listBlockedUsers(linh.id, { limit: 30 })).resolves.toEqual({ items: [], nextCursor: null });
	});

	it("pages the block list with a stable cursor", async () => {
		const binh = await makeUser("binh");
		const chi = await makeUser("chi");
		await blockUser(mai.id, linh.id);
		await blockUser(mai.id, binh.id);
		await blockUser(mai.id, chi.id);

		const first = await listBlockedUsers(mai.id, { limit: 2 });
		expect(first.items).toHaveLength(2);
		expect(first.nextCursor).not.toBeNull();

		const second = await listBlockedUsers(mai.id, { limit: 2, before: first.nextCursor! });
		expect(second.items).toHaveLength(1);
		expect(second.nextCursor).toBeNull();
		expect(new Set([...first.items, ...second.items].map((user) => user.id))).toEqual(
			new Set([linh.id, binh.id, chi.id]),
		);
	});
});
