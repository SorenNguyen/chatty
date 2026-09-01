import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "../src/lib/errors.js";
import sharp from "sharp";
import { prisma } from "../src/lib/prisma.js";
import { register } from "../src/modules/auth/auth.service.js";
import { createConversation } from "../src/modules/conversations/conversations.service.js";
import {
	getMessageContext,
	hideMessageForUser,
	listMessages,
	deleteMessage,
	editMessage,
	removeSavedMessage,
	saveMessageForUser,
	sendMessage,
	setMessagePinned,
} from "../src/modules/messages/messages.service.js";
import { listConversationLinks, listConversationMedia, listSavedMessages } from "../src/modules/vault/vault.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

describe("vault, forwarding, mentions, and pins", () => {
	it("extracts normalized links and returns them from the conversation vault", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const sent = await sendMessage(minhId, conversation.id, {
			content: "Docs https://example.com/path, again https://example.com/path",
		});

		const page = await listConversationLinks(anId, conversation.id, { limit: 20 });

		expect(page.items).toHaveLength(1);
		expect(page.items[0]).toMatchObject({ messageId: sent.id, url: "https://example.com/path" });
	});

	it("replaces vault links on edit and removes them with a tombstone", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const sent = await sendMessage(minhId, conversation.id, { content: "https://before.example" });

		await editMessage(minhId, conversation.id, sent.id, { content: "https://after.example" });
		expect(
			(await listConversationLinks(anId, conversation.id, { limit: 20 })).items.map((item) => item.url),
		).toEqual(["https://after.example"]);

		await deleteMessage(minhId, conversation.id, sent.id);
		expect((await listConversationLinks(anId, conversation.id, { limit: 20 })).items).toEqual([]);
	});

	it("pages media without duplicates and respects delete-for-me", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const image = await sharp({ create: { width: 12, height: 12, channels: 3, background: "black" } })
			.png()
			.toBuffer();
		const first = await sendMessage(minhId, conversation.id, { content: "one", attachments: [image] });
		const second = await sendMessage(minhId, conversation.id, { content: "two", attachments: [image] });
		const third = await sendMessage(minhId, conversation.id, { content: "three", attachments: [image] });
		for (const [message, createdAt] of [
			[first, "2026-01-01T00:00:00.000Z"],
			[second, "2026-01-02T00:00:00.000Z"],
			[third, "2026-01-03T00:00:00.000Z"],
		] as const) {
			await prisma.attachment.update({
				where: { id: message.attachments[0]!.id },
				data: { createdAt: new Date(createdAt) },
			});
		}

		const pageOne = await listConversationMedia(anId, conversation.id, { kind: "image", limit: 2 });
		const pageTwo = await listConversationMedia(anId, conversation.id, {
			kind: "image",
			limit: 2,
			before: pageOne.items.at(-1)!.id,
		});
		expect([...pageOne.items, ...pageTwo.items].map((item) => item.messageId)).toEqual([
			third.id,
			second.id,
			first.id,
		]);
		expect(new Set([...pageOne.items, ...pageTwo.items].map((item) => item.id)).size).toBe(3);

		await hideMessageForUser(anId, conversation.id, second.id);
		expect(
			(await listConversationMedia(anId, conversation.id, { kind: "image", limit: 20 })).items.map(
				(item) => item.messageId,
			),
		).not.toContain(second.id);
		expect(
			(await listConversationMedia(minhId, conversation.id, { kind: "image", limit: 20 })).items.map(
				(item) => item.messageId,
			),
		).toContain(second.id);
	});

	it("stores mentions by participant id and rejects ids outside the group", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const outsiderId = await createUser("outsider");
		const conversation = await createConversation(minhId, { participantIds: [anId, outsiderId], name: "Team" });

		const sent = await sendMessage(minhId, conversation.id, {
			content: "@an_test hello",
			mentionedUserIds: [anId],
		});
		expect(sent.mentionedUserIds).toEqual([anId]);

		const strangerId = await createUser("stranger");
		await expect(
			sendMessage(minhId, conversation.id, { content: "nope", mentionedUserIds: [strangerId] }),
		).rejects.toBeInstanceOf(ValidationError);
	});

	it("copies forwarded attachments instead of referencing the source rows", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const binhId = await createUser("binh");
		const sourceConversation = await createConversation(minhId, { participantIds: [anId] });
		const targetConversation = await createConversation(minhId, { participantIds: [binhId] });
		const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "black" } })
			.png()
			.toBuffer();
		const source = await sendMessage(minhId, sourceConversation.id, { content: "source", attachments: [image] });

		const forwarded = await sendMessage(minhId, targetConversation.id, {
			content: "",
			forwardOfMessageId: source.id,
		});

		expect(forwarded.isForwarded).toBe(true);
		expect(forwarded.content).toBe("source");
		expect(forwarded.attachments[0]?.id).not.toBe(source.attachments[0]?.id);
		expect(
			(await listConversationMedia(binhId, targetConversation.id, { kind: "image", limit: 20 })).items,
		).toHaveLength(1);
	});

	it("requires source membership before forwarding", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const outsiderId = await createUser("outsider");
		const sourceConversation = await createConversation(minhId, { participantIds: [anId] });
		const targetConversation = await createConversation(outsiderId, { participantIds: [anId] });
		const source = await sendMessage(minhId, sourceConversation.id, { content: "private" });

		await expect(
			sendMessage(outsiderId, targetConversation.id, { content: "", forwardOfMessageId: source.id }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("saves per user and limits a conversation to three pinned messages", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const messages = [];
		for (const content of ["one", "two", "three", "four"]) {
			messages.push(await sendMessage(minhId, conversation.id, { content }));
		}

		await saveMessageForUser(anId, conversation.id, messages[0]!.id);
		expect((await listSavedMessages(anId, { limit: 20 })).results[0]?.message.id).toBe(messages[0]!.id);
		await removeSavedMessage(anId, conversation.id, messages[0]!.id);
		expect((await listSavedMessages(anId, { limit: 20 })).results).toEqual([]);

		for (const message of messages.slice(0, 3)) await setMessagePinned(anId, conversation.id, message.id, true);
		await expect(setMessagePinned(anId, conversation.id, messages[3]!.id, true)).rejects.toThrow(
			"at most 3 pinned messages",
		);
	});
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
		expect(message.kind).toBe("user");
		// The whole author, not just an id: a message has to keep its name and
		// face after its writer leaves the group.
		expect(message.author?.id).toBe(minhId);
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

describe("getMessageContext", () => {
	it("returns the target with messages on both sides in display order", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const sent = [];
		for (const content of ["one", "two", "target", "four", "five"]) {
			sent.push(await sendMessage(minhId, conversation.id, { content }));
		}

		const context = await getMessageContext(minhId, conversation.id, sent[2]!.id, { limit: 5 });

		expect(context.messages.map((message) => message.content)).toEqual(["one", "two", "target", "four", "five"]);
		expect(context.hasMoreOlder).toBe(false);
		expect(context.hasMoreNewer).toBe(false);
	});

	it("reports when more history exists outside the context window", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const sent = [];
		for (const content of ["one", "two", "target", "four", "five"]) {
			sent.push(await sendMessage(minhId, conversation.id, { content }));
		}

		const context = await getMessageContext(minhId, conversation.id, sent[2]!.id, { limit: 3 });

		expect(context.messages.map((message) => message.content)).toEqual(["two", "target", "four"]);
		expect(context.hasMoreOlder).toBe(true);
		expect(context.hasMoreNewer).toBe(true);
	});

	it("does not reveal a target to somebody outside the conversation", async () => {
		const minhId = await createUser("minh");
		const anId = await createUser("an");
		const outsiderId = await createUser("outsider");
		const conversation = await createConversation(minhId, { participantIds: [anId] });
		const target = await sendMessage(minhId, conversation.id, { content: "private target" });

		await expect(getMessageContext(outsiderId, conversation.id, target.id, { limit: 5 })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});
});
