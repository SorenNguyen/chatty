import { rm } from "node:fs/promises";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { findAttachmentPath } from "../src/lib/attachment-storage.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import { listConversationsForUser, markConversationRead } from "../src/modules/conversations/conversations.service.js";
import { deleteMessage, editMessage, listMessages, sendMessage } from "../src/modules/messages/messages.service.js";
import { installFakeIO, type FakeIO } from "./fake-io.js";

const UPLOAD_DIR = ".data/test-uploads";

let fakeIO: FakeIO;

beforeEach(() => {
	fakeIO = installFakeIO();
});

afterAll(async () => {
	await rm(UPLOAD_DIR, { recursive: true, force: true });
});

/** The `message:updated` emits only — setting up a conversation emits others. */
function updateEmits() {
	return fakeIO.emits.filter((emit) => emit.event === "message:updated");
}

async function makeImage(): Promise<Buffer> {
	return sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 1, g: 2, b: 3 } } })
		.jpeg()
		.toBuffer();
}

/**
 * A direct conversation and a third person outside it, built with `prisma`
 * rather than `register()`.
 *
 * These tests are not about authentication, and bcrypt at cost 12 four times per
 * test is exactly the slowness `tests/setup.ts` warns turns the truncate hook
 * into a trap.
 */
async function makeConversation(): Promise<{
	conversationId: string;
	authorId: string;
	peerId: string;
	outsiderId: string;
}> {
	const [author, peer, outsider] = await Promise.all([
		prisma.user.create({
			data: { email: "minh@chatty.test", handle: "minh_test", displayName: "Minh", passwordHash: "x" },
			select: { id: true },
		}),
		prisma.user.create({
			data: { email: "an@chatty.test", handle: "an_test", displayName: "An", passwordHash: "x" },
			select: { id: true },
		}),
		prisma.user.create({
			data: { email: "binh@chatty.test", handle: "binh_test", displayName: "Binh", passwordHash: "x" },
			select: { id: true },
		}),
	]);
	const conversation = await prisma.conversation.create({
		data: { participants: { create: [{ userId: author.id }, { userId: peer.id }] } },
		select: { id: true },
	});

	return { conversationId: conversation.id, authorId: author.id, peerId: peer.id, outsiderId: outsider.id };
}

describe("editMessage", () => {
	it("replaces the text and records that it was edited", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "chào An" });

		const edited = await editMessage(authorId, conversationId, sent.id, { content: "chào An nhé" });

		expect(edited.content).toBe("chào An nhé");
		expect(edited.editedAt).not.toBeNull();
		expect(edited.deletedAt).toBeNull();
	});

	it("broadcasts message:updated to the conversation room", async () => {
		// Without this the text changes in the database and nobody else's screen
		// moves — the author would be the only person reading the new version.
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "typo" });

		const edited = await editMessage(authorId, conversationId, sent.id, { content: "fixed" });

		expect(updateEmits()).toEqual([{ room: conversationId, event: "message:updated", payload: edited }]);
	});

	it("trims the new text, so three spaces is not an edit that empties a message", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "hello" });

		await expect(editMessage(authorId, conversationId, sent.id, { content: "   " })).rejects.toBeInstanceOf(
			ValidationError,
		);
	});

	it("allows clearing the caption of a message that still has its image", async () => {
		// The send rule, restated: a message has to be *something*. A picture is.
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "look", attachment: await makeImage() });

		const edited = await editMessage(authorId, conversationId, sent.id, { content: "" });

		expect(edited.content).toBe("");
		expect(edited.attachment).not.toBeNull();
	});

	it("refuses someone who did not write the message", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "mine" });

		await expect(editMessage(peerId, conversationId, sent.id, { content: "yours now" })).rejects.toBeInstanceOf(
			ForbiddenError,
		);
	});

	it("refuses someone outside the conversation, without confirming the message exists", async () => {
		const { conversationId, authorId, outsiderId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "private" });

		// NotFoundError rather than ForbiddenError: a 403 here would confirm that
		// this conversation id is real to someone who cannot see it.
		await expect(editMessage(outsiderId, conversationId, sent.id, { content: "hi" })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});

	it("refuses a message id from another conversation", async () => {
		const first = await makeConversation();
		const other = await prisma.conversation.create({
			data: { participants: { create: [{ userId: first.authorId }] } },
			select: { id: true },
		});
		const elsewhere = await sendMessage(first.authorId, other.id, { content: "over here" });

		await expect(
			editMessage(first.authorId, first.conversationId, elsewhere.id, { content: "moved" }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("refuses a message that was already deleted", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "gone" });
		await deleteMessage(authorId, conversationId, sent.id);

		await expect(editMessage(authorId, conversationId, sent.id, { content: "back" })).rejects.toBeInstanceOf(
			ValidationError,
		);
	});

	it("refuses a system message, which nobody wrote", async () => {
		const { conversationId, authorId } = await makeConversation();
		const systemMessage = await prisma.message.create({
			data: { conversationId, kind: "SYSTEM", content: "An added Binh" },
			select: { id: true },
		});

		await expect(
			editMessage(authorId, conversationId, systemMessage.id, { content: "An removed Binh" }),
		).rejects.toBeInstanceOf(ForbiddenError);
	});

	it("does not move the conversation to the top of the sidebar", async () => {
		// Fixing a typo in something sent last week is not new activity. Bumping
		// updatedAt would raise that thread above genuinely newer ones.
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "typo" });
		const before = await prisma.conversation.findUniqueOrThrow({
			where: { id: conversationId },
			select: { updatedAt: true },
		});

		await editMessage(authorId, conversationId, sent.id, { content: "fixed" });

		const after = await prisma.conversation.findUniqueOrThrow({
			where: { id: conversationId },
			select: { updatedAt: true },
		});
		expect(after.updatedAt).toEqual(before.updatedAt);
	});
});

describe("deleteMessage", () => {
	it("empties the text and marks the message deleted", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "said too much" });

		const deleted = await deleteMessage(authorId, conversationId, sent.id);

		expect(deleted.deletedAt).not.toBeNull();
		expect(deleted.content).toBe("");
	});

	it("leaves nothing of the text in the database", async () => {
		// "Deleted" has to mean gone, not hidden behind a flag the next query
		// forgets to check. The migration's check constraint enforces the same rule.
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "a secret" });

		await deleteMessage(authorId, conversationId, sent.id);

		const row = await prisma.message.findUniqueOrThrow({ where: { id: sent.id }, select: { content: true } });
		expect(row.content).toBe("");
	});

	it("removes the image, its row, and its file", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "look", attachment: await makeImage() });
		const attachmentId = sent.attachment!.id;
		expect(await findAttachmentPath(attachmentId)).not.toBeNull();

		const deleted = await deleteMessage(authorId, conversationId, sent.id);

		expect(deleted.attachment).toBeNull();
		await expect(prisma.attachment.count({ where: { id: attachmentId } })).resolves.toBe(0);
		expect(await findAttachmentPath(attachmentId)).toBeNull();
	});

	it("keeps the message in the conversation, in its place", async () => {
		// The tombstone is the point: hard-deleting the row would break the paging
		// cursor and every read marker pointing at it.
		const { conversationId, authorId } = await makeConversation();
		await sendMessage(authorId, conversationId, { content: "first" });
		const second = await sendMessage(authorId, conversationId, { content: "second" });
		await sendMessage(authorId, conversationId, { content: "third" });

		await deleteMessage(authorId, conversationId, second.id);

		const messages = await listMessages(authorId, conversationId, { limit: 50 });
		expect(messages.map((message) => message.content)).toEqual(["third", "", "first"]);
		expect(messages[1]!.deletedAt).not.toBeNull();
	});

	it("does not relight the badge on a conversation the reader had finished", async () => {
		// The bug a hard delete would have shipped: the unread query LEFT JOINs the
		// reader's marker and treats a miss as "nothing read yet", so deleting the
		// message their marker points at would have counted the whole history again.
		const { conversationId, authorId, peerId } = await makeConversation();
		await sendMessage(authorId, conversationId, { content: "one" });
		const newest = await sendMessage(authorId, conversationId, { content: "two" });
		await markConversationRead(peerId, conversationId, { messageId: newest.id });

		await deleteMessage(authorId, conversationId, newest.id);

		const [conversation] = await listConversationsForUser(peerId);
		expect(conversation!.unreadCount).toBe(0);
	});

	it("stops counting a deleted message as unread", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "never mind" });

		const [before] = await listConversationsForUser(peerId);
		expect(before!.unreadCount).toBe(1);

		await deleteMessage(authorId, conversationId, sent.id);

		const [after] = await listConversationsForUser(peerId);
		expect(after!.unreadCount).toBe(0);
	});

	it("broadcasts message:updated to the conversation room", async () => {
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "oops" });

		const deleted = await deleteMessage(authorId, conversationId, sent.id);

		expect(updateEmits()).toEqual([{ room: conversationId, event: "message:updated", payload: deleted }]);
	});

	it("is idempotent, and says nothing the second time", async () => {
		// Two tabs pressing the button is the ordinary case, not an error — and a
		// second broadcast would only re-render what is already on screen.
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "oops" });
		const first = await deleteMessage(authorId, conversationId, sent.id);

		const second = await deleteMessage(authorId, conversationId, sent.id);

		expect(second.deletedAt).toBe(first.deletedAt);
		expect(updateEmits()).toHaveLength(1);
	});

	it("refuses someone who did not write the message", async () => {
		const { conversationId, authorId, peerId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "mine" });

		await expect(deleteMessage(peerId, conversationId, sent.id)).rejects.toBeInstanceOf(ForbiddenError);
		await expect(prisma.message.count({ where: { id: sent.id, deletedAt: null } })).resolves.toBe(1);
	});

	it("refuses a system message, so the group log cannot be rewritten", async () => {
		const { conversationId, authorId } = await makeConversation();
		const systemMessage = await prisma.message.create({
			data: { conversationId, kind: "SYSTEM", content: "An added Binh" },
			select: { id: true },
		});

		await expect(deleteMessage(authorId, conversationId, systemMessage.id)).rejects.toBeInstanceOf(ForbiddenError);
	});

	it("refuses someone outside the conversation", async () => {
		const { conversationId, authorId, outsiderId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "private" });

		await expect(deleteMessage(outsiderId, conversationId, sent.id)).rejects.toBeInstanceOf(NotFoundError);
	});
});
