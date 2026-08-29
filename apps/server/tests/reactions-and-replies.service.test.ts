import type { MessageDTO } from "@chatty/shared-types";
import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import { deleteMessage, listMessages, sendMessage, toggleReaction } from "../src/modules/messages/messages.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

describe("toggleReaction", () => {
	it("adds the reaction, and taking it off is the same call again", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "shipped it" });

		const added = await toggleReaction(peerId, conversationId, sent.id, { kind: "heart" });
		expect(added.reactions).toEqual([{ kind: "heart", userIds: [peerId] }]);

		const removed = await toggleReaction(peerId, conversationId, sent.id, { kind: "heart" });
		expect(removed.reactions).toEqual([]);
	});

	it("counts each person once per kind, and lets one person leave several", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "shipped it" });

		await toggleReaction(peerId, conversationId, sent.id, { kind: "heart" });
		await toggleReaction(authorId, conversationId, sent.id, { kind: "heart" });
		const message = await toggleReaction(peerId, conversationId, sent.id, { kind: "laugh" });

		expect(message.reactions).toEqual([
			{ kind: "heart", userIds: [peerId, authorId] },
			{ kind: "laugh", userIds: [peerId] },
		]);
	});

	it("keeps the chips in the order the kinds were first used", async () => {
		// Otherwise a chip hops sideways whenever somebody else reacts, and the one
		// you were about to click is no longer under the cursor.
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "shipped it" });
		await toggleReaction(peerId, conversationId, sent.id, { kind: "laugh" });
		await toggleReaction(peerId, conversationId, sent.id, { kind: "heart" });

		// A second heart must not promote it past the laugh that came first.
		const message = await toggleReaction(authorId, conversationId, sent.id, { kind: "heart" });

		expect(message.reactions.map((reaction) => reaction.kind)).toEqual(["laugh", "heart"]);
	});

	it("names everyone rather than counting, so a broadcast is not one viewer's answer", async () => {
		// The DTO goes to every socket in the room as one payload. Anything saying
		// "is this mine" would be saying it about whoever triggered the write.
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "shipped it" });

		const message = await toggleReaction(peerId, conversationId, sent.id, { kind: "heart" });

		expect(message.reactions[0]!.userIds).toEqual([peerId]);
	});

	it("broadcasts message:updated so everyone renders it by the same path", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "shipped it" });

		const message = await toggleReaction(peerId, conversationId, sent.id, { kind: "heart" });

		expect(fakeIO.emits.filter((emit) => emit.event === "message:updated")).toEqual([
			{ room: conversationId, event: "message:updated", payload: message },
		]);
	});

	it("refuses a message in another conversation, without saying it exists", async () => {
		const { conversationId, authorId } = await makeConversation();
		const elsewhere = await makeConversation("second");
		const sent = await sendMessage(elsewhere.authorId, elsewhere.conversationId, { content: "not yours" });

		await expect(toggleReaction(authorId, conversationId, sent.id, { kind: "heart" })).rejects.toBeInstanceOf(
			NotFoundError,
		);
		await expect(prisma.messageReaction.count()).resolves.toBe(0);
	});

	it("refuses someone outside the conversation", async () => {
		const { conversationId, authorId, outsiderId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "private" });

		await expect(toggleReaction(outsiderId, conversationId, sent.id, { kind: "heart" })).rejects.toThrow();
		await expect(prisma.messageReaction.count()).resolves.toBe(0);
	});

	it("refuses a deleted message", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "oops" });
		await deleteMessage(authorId, conversationId, sent.id);

		await expect(toggleReaction(peerId, conversationId, sent.id, { kind: "heart" })).rejects.toBeInstanceOf(
			ValidationError,
		);
	});

	it("drops the reactions of a message that is deleted after being reacted to", async () => {
		// The rows survive the tombstone, but nothing may render them: three hearts
		// under "This message was deleted" reads as approval of the deletion.
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "oops" });
		await toggleReaction(peerId, conversationId, sent.id, { kind: "heart" });

		const tombstone = await deleteMessage(authorId, conversationId, sent.id);

		expect(tombstone.reactions).toEqual([]);
	});

	it("refuses a system message, which is the app talking", async () => {
		const { conversationId, authorId } = await makeConversation();
		const systemMessage = await prisma.message.create({
			data: { conversationId, kind: "SYSTEM", content: "An added Binh" },
			select: { id: true },
		});

		await expect(
			toggleReaction(authorId, conversationId, systemMessage.id, { kind: "heart" }),
		).rejects.toBeInstanceOf(ValidationError);
	});

	it("goes with the person, when a person goes", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "shipped it" });
		await toggleReaction(peerId, conversationId, sent.id, { kind: "heart" });

		await prisma.user.delete({ where: { id: peerId } });

		// Unlike a message, which becomes authorless and stays. A reaction carries
		// no history worth keeping without the person who left it.
		await expect(prisma.messageReaction.count()).resolves.toBe(0);
	});
});

describe("replying", () => {
	it("quotes the parent as it stands, not as it was sent", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const parent = await sendMessage(authorId, conversationId, { content: "meet at 5" });
		const reply = await sendMessage(peerId, conversationId, { content: "works for me", replyToId: parent.id });

		expect(reply.replyTo).toEqual({
			id: parent.id,
			authorName: "Minh",
			content: "meet at 5",
			hasAttachment: false,
			attachmentUrl: null,
			isDeleted: false,
		});
	});

	it("re-quotes an edited parent with its new text", async () => {
		// A copy taken at send time would keep showing words the author replaced,
		// which is the case a quote most needs to be honest about.
		const { conversationId, authorId, peerId } = await makeConversation();
		const parent = await sendMessage(authorId, conversationId, { content: "meet at 5" });
		const reply = await sendMessage(peerId, conversationId, { content: "works for me", replyToId: parent.id });

		await prisma.message.update({ where: { id: parent.id }, data: { content: "meet at 6" } });
		const [reloaded] = await listReplies(conversationId, peerId);

		expect(reloaded!.id).toBe(reply.id);
		expect(reloaded!.replyTo!.content).toBe("meet at 6");
	});

	it("quotes a deleted parent as a tombstone, surrendering its text", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const parent = await sendMessage(authorId, conversationId, { content: "sent to the wrong person" });
		await sendMessage(peerId, conversationId, { content: "what?", replyToId: parent.id });

		await deleteMessage(authorId, conversationId, parent.id);
		const messages = await listReplies(conversationId, peerId);

		expect(messages[0]!.replyTo).toMatchObject({ isDeleted: true, content: "" });
	});

	it("refuses a parent from another conversation", async () => {
		// The security half of the rule: without it a reply could quote a message
		// out of a conversation the sender was never in, and leak its text.
		const { conversationId, authorId } = await makeConversation();
		const elsewhere = await makeConversation("second");
		const foreign = await sendMessage(elsewhere.authorId, elsewhere.conversationId, { content: "not yours" });

		await expect(
			sendMessage(authorId, conversationId, { content: "sneaky", replyToId: foreign.id }),
		).rejects.toBeInstanceOf(ValidationError);
	});

	it("refuses a parent that does not exist at all", async () => {
		const { conversationId, authorId } = await makeConversation();

		await expect(
			sendMessage(authorId, conversationId, { content: "sneaky", replyToId: "no-such-message" }),
		).rejects.toBeInstanceOf(ValidationError);
	});

	it("leaves an ordinary message with no parent", async () => {
		const { conversationId, authorId } = await makeConversation();

		const sent = await sendMessage(authorId, conversationId, { content: "just talking" });

		expect(sent.replyTo).toBeNull();
	});
});

/**
 * The replies in a conversation, re-read through the list endpoint.
 *
 * Going back through `listMessages` rather than asserting on the value
 * `sendMessage` returned is the point of these two tests: a quote is resolved on
 * every read, so only a re-read can show it following the parent's edits.
 */
async function listReplies(conversationId: string, viewerId: string): Promise<MessageDTO[]> {
	const messages = await listMessages(viewerId, conversationId, { limit: 50 });

	return messages.filter((message) => message.replyTo !== null);
}

async function makeConversation(suffix = "first"): Promise<{
	conversationId: string;
	authorId: string;
	peerId: string;
	outsiderId: string;
}> {
	const [author, peer, outsider] = await Promise.all([
		prisma.user.create({
			data: {
				email: `minh-${suffix}@chatty.test`,
				handle: `minh_${suffix}`,
				displayName: "Minh",
				passwordHash: "x",
			},
			select: { id: true },
		}),
		prisma.user.create({
			data: { email: `an-${suffix}@chatty.test`, handle: `an_${suffix}`, displayName: "An", passwordHash: "x" },
			select: { id: true },
		}),
		prisma.user.create({
			data: {
				email: `binh-${suffix}@chatty.test`,
				handle: `binh_${suffix}`,
				displayName: "Binh",
				passwordHash: "x",
			},
			select: { id: true },
		}),
	]);
	const conversation = await prisma.conversation.create({
		data: { participants: { create: [{ userId: author.id }, { userId: peer.id }] } },
		select: { id: true },
	});

	return { conversationId: conversation.id, authorId: author.id, peerId: peer.id, outsiderId: outsider.id };
}
