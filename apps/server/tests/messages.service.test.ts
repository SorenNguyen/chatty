import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import { register } from "../src/modules/auth/auth.service.js";
import { createConversation } from "../src/modules/conversations/conversations.service.js";
import { listMessages, sendMessage } from "../src/modules/messages/messages.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

/**
 * The `message:new` emits only.
 *
 * Setting up a conversation emits `conversation:new` too, so asserting on the
 * raw total made these tests fail the moment an unrelated event was added.
 * Filtering by event keeps them about what they actually check.
 */
function messageEmits() {
	return fakeIO.emits.filter((emit) => emit.event === "message:new");
}

async function createUser(name: string): Promise<string> {
	const { user } = await register({
		email: `${name}@chatty.test`,
		password: "SuperSecret123",
		// Suffixed so short names like "an" still clear the 3-character minimum.
		handle: `${name}_test`,
		displayName: name,
	});

	return user.id;
}

describe("sendMessage", () => {
	it("stores the message and returns it", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });

		const message = await sendMessage(minhId, conversation.id, { content: "Chào An" });

		expect(message.content).toBe("Chào An");
		expect(message.authorId).toBe(minhId);
		expect(message.conversationId).toBe(conversation.id);
		await expect(prisma.message.count({ where: { conversationId: conversation.id } })).resolves.toBe(1);
	});

	it("broadcasts message:new to the conversation room", async () => {
		// Without this the message is saved but nobody's screen updates.
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });

		const message = await sendMessage(minhId, conversation.id, { content: "Chào An" });

		expect(messageEmits()).toHaveLength(1);
		expect(messageEmits()[0]).toEqual({ room: conversation.id, event: "message:new", payload: message });
	});

	it("bumps the conversation's updatedAt so it sorts to the top", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const before = await prisma.conversation.findUniqueOrThrow({
			where: { id: conversation.id },
			select: { updatedAt: true },
		});

		await sendMessage(minhId, conversation.id, { content: "Chào An" });

		const after = await prisma.conversation.findUniqueOrThrow({
			where: { id: conversation.id },
			select: { updatedAt: true },
		});
		expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
	});

	it("throws NotFoundError when the sender is not a participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const outsiderId = await createUser("outsider");
		const conversation = await createConversation(minhId, { participantIds: [anId] });

		await expect(sendMessage(outsiderId, conversation.id, { content: "let me in" })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});

	it("does not broadcast when the sender is rejected", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const outsiderId = await createUser("outsider");
		const conversation = await createConversation(minhId, { participantIds: [anId] });

		await sendMessage(outsiderId, conversation.id, { content: "let me in" }).catch(() => undefined);

		expect(messageEmits()).toHaveLength(0);
	});
});

describe("listMessages", () => {
	it("returns messages newest first", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		await sendMessage(minhId, conversation.id, { content: "first" });
		await sendMessage(anId, conversation.id, { content: "second" });

		const messages = await listMessages(minhId, conversation.id, { limit: 50 });

		expect(messages.map((message) => message.content)).toEqual(["second", "first"]);
	});

	it("respects the limit", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		await sendMessage(minhId, conversation.id, { content: "first" });
		await sendMessage(minhId, conversation.id, { content: "second" });
		await sendMessage(minhId, conversation.id, { content: "third" });

		const messages = await listMessages(minhId, conversation.id, { limit: 2 });

		expect(messages).toHaveLength(2);
	});

	it("pages backwards from the `before` cursor, excluding the cursor itself", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		await sendMessage(minhId, conversation.id, { content: "first" });
		await sendMessage(minhId, conversation.id, { content: "second" });
		await sendMessage(minhId, conversation.id, { content: "third" });

		const firstPage = await listMessages(minhId, conversation.id, { limit: 2 });
		const secondPage = await listMessages(minhId, conversation.id, {
			limit: 2,
			before: firstPage[firstPage.length - 1]!.id,
		});

		expect(firstPage.map((message) => message.content)).toEqual(["third", "second"]);
		expect(secondPage.map((message) => message.content)).toEqual(["first"]);
	});

	it("throws NotFoundError when the reader is not a participant", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const outsiderId = await createUser("outsider");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		await sendMessage(minhId, conversation.id, { content: "private" });

		await expect(listMessages(outsiderId, conversation.id, { limit: 50 })).rejects.toBeInstanceOf(NotFoundError);
	});
});
