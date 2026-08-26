import { rm } from "node:fs/promises";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { findAttachmentPath } from "../src/lib/attachment-storage.js";
import { isValidAttachmentToken, signAttachmentToken } from "../src/lib/attachment-token.js";
import { ValidationError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import { getAttachmentFilePath } from "../src/modules/attachments/attachments.service.js";
import { listMessages, sendMessage } from "../src/modules/messages/messages.service.js";
import { installFakeIO } from "./fake-io.js";

const UPLOAD_DIR = ".data/test-uploads";

// `sendMessage` broadcasts, and getIO() throws when nothing has been installed.
beforeEach(() => {
	installFakeIO();
});

afterAll(async () => {
	await rm(UPLOAD_DIR, { recursive: true, force: true });
});

/** A real JPEG, wider than it is tall, and larger than the 1600px cap. */
async function makeImage(width = 2400, height = 1200): Promise<Buffer> {
	return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } } })
		.jpeg()
		.toBuffer();
}

/** A conversation between two people, created directly — these tests are not about auth. */
async function makeConversation(): Promise<{ conversationId: string; authorId: string; outsiderId: string }> {
	const author = await prisma.user.create({
		data: { email: "minh@chatty.test", handle: "minh_test", displayName: "Minh", passwordHash: "x" },
		select: { id: true },
	});
	const peer = await prisma.user.create({
		data: { email: "an@chatty.test", handle: "an_test", displayName: "An", passwordHash: "x" },
		select: { id: true },
	});
	const outsider = await prisma.user.create({
		data: { email: "binh@chatty.test", handle: "binh_test", displayName: "Binh", passwordHash: "x" },
		select: { id: true },
	});
	const conversation = await prisma.conversation.create({
		data: { participants: { create: [{ userId: author.id }, { userId: peer.id }] } },
		select: { id: true },
	});

	return { conversationId: conversation.id, authorId: author.id, outsiderId: outsider.id };
}

describe("sendMessage with an attachment", () => {
	it("stores the image and returns it on the message", async () => {
		const { conversationId, authorId } = await makeConversation();

		const message = await sendMessage(authorId, conversationId, { content: "look", attachment: await makeImage() });

		expect(message.content).toBe("look");
		expect(message.attachment).not.toBeNull();
		expect(message.attachment!.byteSize).toBeGreaterThan(0);
	});

	it("scales the longest edge down to the cap and keeps the aspect ratio", async () => {
		// 2400x1200 is 2:1, so the stored image must be 1600x800 — not 1600x1600,
		// which is what `fit: "cover"` (what avatars use) would produce.
		const { conversationId, authorId } = await makeConversation();

		const message = await sendMessage(authorId, conversationId, { content: "", attachment: await makeImage() });

		expect(message.attachment!.width).toBe(1600);
		expect(message.attachment!.height).toBe(800);
	});

	it("does not enlarge an image that is already smaller than the cap", async () => {
		const { conversationId, authorId } = await makeConversation();

		const message = await sendMessage(authorId, conversationId, {
			content: "",
			attachment: await makeImage(400, 300),
		});

		expect(message.attachment).toMatchObject({ width: 400, height: 300 });
	});

	it("writes the file under the attachment's own id", async () => {
		const { conversationId, authorId } = await makeConversation();

		const message = await sendMessage(authorId, conversationId, { content: "", attachment: await makeImage() });

		expect(await findAttachmentPath(message.attachment!.id)).not.toBeNull();
	});

	it("allows a message that is only an image", async () => {
		const { conversationId, authorId } = await makeConversation();

		const message = await sendMessage(authorId, conversationId, { content: "", attachment: await makeImage() });

		expect(message.content).toBe("");
		expect(message.attachment).not.toBeNull();
	});

	it("leaves attachment null on a text-only message", async () => {
		const { conversationId, authorId } = await makeConversation();

		const message = await sendMessage(authorId, conversationId, { content: "just text" });

		expect(message.attachment).toBeNull();
	});

	it("rejects a file that is not an image, without creating a message", async () => {
		// The MIME filter on the upload middleware can be lied to; the re-encode
		// is the check that actually holds.
		const { conversationId, authorId } = await makeConversation();

		await expect(
			sendMessage(authorId, conversationId, { content: "", attachment: Buffer.from("not an image at all") }),
		).rejects.toBeInstanceOf(ValidationError);

		expect(await prisma.message.count({ where: { conversationId } })).toBe(0);
	});

	it("refuses to send into a conversation the author is not in", async () => {
		// Membership is checked before anything is written to disk.
		const { conversationId, outsiderId } = await makeConversation();

		await expect(
			sendMessage(outsiderId, conversationId, { content: "", attachment: await makeImage() }),
		).rejects.toThrow();

		expect(await prisma.attachment.count()).toBe(0);
	});

	it("comes back on the message list too", async () => {
		const { conversationId, authorId } = await makeConversation();
		await sendMessage(authorId, conversationId, { content: "", attachment: await makeImage() });

		const [listed] = await listMessages(authorId, conversationId, { limit: 50 });

		expect(listed!.attachment).not.toBeNull();
	});

	it("addresses the image by a signed token rather than a bare path", async () => {
		// The id is the stable handle; the url is a capability that is re-minted on
		// every read and must never be treated as an identity. Note the two mints
		// here are byte-identical — a JWT's `iat` has one-second resolution, so two
		// signed in the same second match. That is precisely why the id, and not
		// the url, is what anything downstream keys on.
		const { conversationId, authorId } = await makeConversation();
		const sent = await sendMessage(authorId, conversationId, { content: "", attachment: await makeImage() });

		const [listed] = await listMessages(authorId, conversationId, { limit: 50 });

		expect(listed!.attachment!.id).toBe(sent.attachment!.id);
		expect(new URL(listed!.attachment!.url).searchParams.get("token")).toBeTruthy();
	});

	it("is deleted with its message", async () => {
		const { conversationId, authorId } = await makeConversation();
		const message = await sendMessage(authorId, conversationId, { content: "", attachment: await makeImage() });

		await prisma.message.delete({ where: { id: message.id } });

		expect(await prisma.attachment.count({ where: { id: message.attachment!.id } })).toBe(0);
	});
});

describe("attachment tokens", () => {
	it("accepts a token minted for the same attachment", () => {
		expect(isValidAttachmentToken(signAttachmentToken("attachment-1"), "attachment-1")).toBe(true);
	});

	it("refuses a valid token replayed against a different attachment", () => {
		// Without the id in the payload, one leaked URL would open every image.
		expect(isValidAttachmentToken(signAttachmentToken("attachment-1"), "attachment-2")).toBe(false);
	});

	it("refuses a token that is not a token", () => {
		expect(isValidAttachmentToken("nonsense", "attachment-1")).toBe(false);
	});
});

describe("getAttachmentFilePath", () => {
	it("returns the path for a valid token", async () => {
		const { conversationId, authorId } = await makeConversation();
		const message = await sendMessage(authorId, conversationId, { content: "", attachment: await makeImage() });
		const attachmentId = message.attachment!.id;

		const filePath = await getAttachmentFilePath(attachmentId, signAttachmentToken(attachmentId));

		expect(filePath).toContain(attachmentId);
	});

	it("hides a real attachment behind a bad token", async () => {
		// 404 rather than 401 on purpose: 401 would confirm the id exists.
		const { conversationId, authorId } = await makeConversation();
		const message = await sendMessage(authorId, conversationId, { content: "", attachment: await makeImage() });

		await expect(getAttachmentFilePath(message.attachment!.id, "nonsense")).rejects.toThrow("Attachment not found");
	});
});
