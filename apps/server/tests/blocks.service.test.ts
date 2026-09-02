import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { blockUser, listBlockedUsers, listBlockedUserIds, unblockUser } from "../src/modules/blocks/blocks.service.js";
import { createConversation } from "../src/modules/conversations/conversations.service.js";
import { sendMessage } from "../src/modules/messages/messages.service.js";
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
	// Every path here broadcasts, so the bus has to exist even though nothing
	// below asserts on what went over it.
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
		await expect(listBlockedUsers(mai.id)).resolves.toHaveLength(1);

		await unblockUser(mai.id, linh.id);

		await expect(listBlockedUsers(mai.id)).resolves.toEqual([]);
		await expect(createConversation(mai.id, { participantIds: [linh.id] })).resolves.toBeTruthy();
	});

	it("refuses to block yourself", async () => {
		await expect(blockUser(mai.id, mai.id)).rejects.toThrow("You cannot block yourself");
	});

	it("reports the pair from either side", async () => {
		await blockUser(mai.id, linh.id);

		await expect(listBlockedUserIds(mai.id)).resolves.toEqual([linh.id]);
		await expect(listBlockedUserIds(linh.id)).resolves.toEqual([mai.id]);
		// Only the blocker's own list is something they can undo from.
		await expect(listBlockedUsers(linh.id)).resolves.toEqual([]);
	});
});
