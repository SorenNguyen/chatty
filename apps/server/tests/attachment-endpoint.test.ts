import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { signAttachmentToken } from "../src/lib/attachment-token.js";
import { prisma } from "../src/lib/prisma.js";
import { installFakeIO } from "./fake-io.js";

/**
 * `POST /conversations/:id/messages` with a file, and `GET /attachments/:id`,
 * over real HTTP.
 *
 * Three things only exist above the service layer and so can only fail here:
 * multer turning a multipart body into `req.file`, `sendFile` actually finding a
 * path under a dot directory, and the fact that both kinds of JWT in this app
 * are signed with the same secret. That last one is a vulnerability rather than
 * a bug — an attachment token accepted by `requireAuth` would authenticate as a
 * user whose id is an attachment id — and nothing below this layer can see it.
 */

const UPLOAD_DIR = ".data/test-uploads";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
	// Port 0: the OS picks a free one, so this cannot collide with a dev server.
	server = createServer(createApp()).listen(0);
	await once(server, "listening");
	baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
	installFakeIO();
});

afterAll(async () => {
	server.close();
	await rm(UPLOAD_DIR, { recursive: true, force: true });
});

async function makeImage(width = 800, height = 400): Promise<Buffer> {
	return sharp({ create: { width, height, channels: 3, background: { r: 9, g: 9, b: 9 } } })
		.png()
		.toBuffer();
}

/** A registered user in a conversation with one other person, plus their token. */
async function makeSender(): Promise<{ token: string; conversationId: string }> {
	const response = await fetch(`${baseUrl}/auth/register`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email: "minh@chatty.test",
			password: "SuperSecret123",
			handle: "minh_test",
			displayName: "Minh",
		}),
	});
	const { token, user } = (await response.json()) as { token: string; user: { id: string } };

	const peer = await prisma.user.create({
		data: { email: "an@chatty.test", handle: "an_test", displayName: "An", passwordHash: "x" },
		select: { id: true },
	});
	const conversation = await prisma.conversation.create({
		data: { participants: { create: [{ userId: user.id }, { userId: peer.id }] } },
		select: { id: true },
	});

	return { token, conversationId: conversation.id };
}

/** Sends one image and returns the created message. */
async function sendImage(
	token: string,
	conversationId: string,
	options: { caption?: string; file?: Blob } = {},
): Promise<Response> {
	const body = new FormData();
	body.append("attachment", options.file ?? new Blob([await makeImage()], { type: "image/png" }), "photo.png");
	if (options.caption !== undefined) body.append("content", options.caption);

	// No Content-Type header set by hand: the browser (and undici) has to add the
	// multipart boundary, and declaring JSON over the top makes the body unparseable.
	return fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}` },
		body,
	});
}

describe("POST /conversations/:id/messages with an image", () => {
	it("creates a message carrying the attachment", async () => {
		const { token, conversationId } = await makeSender();

		const response = await sendImage(token, conversationId, { caption: "look at this" });

		expect(response.status).toBe(201);
		const message = (await response.json()) as {
			content: string;
			attachments: { id: string; width: number }[];
		};
		expect(message.content).toBe("look at this");
		expect(message.attachments).toHaveLength(1);
		expect(message.attachments[0]!.width).toBe(800);
	});

	it("accepts an image with no caption", async () => {
		const { token, conversationId } = await makeSender();

		expect((await sendImage(token, conversationId)).status).toBe(201);
	});

	it("still accepts a plain JSON text message on the same route", async () => {
		// The upload middleware has to pass a non-multipart body straight through,
		// or adding attachments breaks every message that does not have one.
		const { token, conversationId } = await makeSender();

		const response = await fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({ content: "just text" }),
		});

		expect(response.status).toBe(201);
		expect(((await response.json()) as { attachments: unknown[] }).attachments).toEqual([]);
	});

	it("400s on a message with neither text nor image", async () => {
		const { token, conversationId } = await makeSender();

		const response = await fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({ content: "   " }),
		});

		expect(response.status).toBe(400);
	});

	it("400s on a file that is not an image", async () => {
		const { token, conversationId } = await makeSender();

		const response = await sendImage(token, conversationId, {
			file: new Blob([Buffer.from("%PDF-1.4 not an image")], { type: "application/pdf" }),
		});

		expect(response.status).toBe(400);
	});
});

describe("POST /conversations/:id/messages with several images", () => {
	/** Repeats the same field name once per file — how multipart carries a list. */
	async function sendImages(token: string, conversationId: string, count: number): Promise<Response> {
		const body = new FormData();
		for (let index = 0; index < count; index += 1) {
			// Distinct sizes, so the response's order can be checked against the
			// order they were appended in rather than assumed.
			const bytes = await makeImage(200 + index * 100, 200);
			body.append("attachment", new Blob([bytes], { type: "image/png" }), `photo-${index}.png`);
		}

		return fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
			body,
		});
	}

	it("accepts a repeated field and keeps the order it arrived in", async () => {
		// Nothing below this layer can check it: multer's `array()` parse and the
		// order it hands the buffers over are exactly what a service test stubs.
		const { token, conversationId } = await makeSender();

		const response = await sendImages(token, conversationId, 3);
		const message = (await response.json()) as { attachments: { width: number }[] };

		expect(response.status).toBe(201);
		expect(message.attachments.map((attachment) => attachment.width)).toEqual([200, 300, 400]);
	});

	it("refuses more than the cap with a sentence rather than a 500", async () => {
		// Multer aborts with LIMIT_FILE_COUNT, which reaches the error middleware
		// as an unrecognised error unless it is translated — "something broke"
		// instead of "that is too many pictures".
		const { token, conversationId } = await makeSender();

		const response = await sendImages(token, conversationId, 11);

		expect(response.status).toBe(400);
		expect(((await response.json()) as { message: string }).message).toMatch(/at most 10 images/i);
	});
});

describe("GET /attachments/:attachmentId", () => {
	async function sendAndGetUrl(): Promise<{ url: string; attachmentId: string; token: string }> {
		const { token, conversationId } = await makeSender();
		const response = await sendImage(token, conversationId);
		const message = (await response.json()) as { attachments: { id: string; url: string }[] };

		return { url: message.attachments[0]!.url, attachmentId: message.attachments[0]!.id, token };
	}

	/** The DTO's absolute URL points at PUBLIC_URL, which is not this test server. */
	function onTestServer(url: string): string {
		return `${baseUrl}${new URL(url).pathname}${new URL(url).search}`;
	}

	it("serves the re-encoded image", async () => {
		const { url } = await sendAndGetUrl();

		const response = await fetch(onTestServer(url));

		expect(response.status).toBe(200);
		// WebP whatever went in — the PNG that was uploaded no longer exists.
		expect(response.headers.get("content-type")).toBe("image/webp");
		expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
	});

	it("serves it without an Authorization header", async () => {
		// The whole point of the signed URL: an <img> tag cannot send one.
		const { url } = await sendAndGetUrl();

		expect((await fetch(onTestServer(url))).status).toBe(200);
	});

	it("never lets a shared cache hold it", async () => {
		const { url } = await sendAndGetUrl();

		expect((await fetch(onTestServer(url))).headers.get("cache-control")).toContain("private");
	});

	it("404s on a token minted for a different attachment", async () => {
		const { attachmentId } = await sendAndGetUrl();

		const response = await fetch(
			`${baseUrl}/attachments/${attachmentId}?token=${signAttachmentToken("some-other-id")}`,
		);

		expect(response.status).toBe(404);
	});

	it("404s rather than 401s on a bad token, so the id is not confirmed", async () => {
		const { attachmentId } = await sendAndGetUrl();

		expect((await fetch(`${baseUrl}/attachments/${attachmentId}?token=nonsense`)).status).toBe(404);
	});

	it("400s when no token is given at all", async () => {
		const { attachmentId } = await sendAndGetUrl();

		expect((await fetch(`${baseUrl}/attachments/${attachmentId}`)).status).toBe(400);
	});

	it("rejects an id shaped like a path escape", async () => {
		const response = await fetch(
			`${baseUrl}/attachments/${encodeURIComponent("../../etc/passwd")}?token=${signAttachmentToken("x")}`,
		);

		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(response.status).toBeLessThan(500);
	});
});

describe("the two kinds of token cannot be swapped", () => {
	it("refuses a user's access token as an attachment token", async () => {
		const { token, conversationId } = await makeSender();
		const message = (await (await sendImage(token, conversationId)).json()) as { attachments: { id: string }[] };

		// Signed with the same secret and verifies fine — only the `typ` claim and
		// the `sub` comparison tell them apart.
		const response = await fetch(`${baseUrl}/attachments/${message.attachments[0]!.id}?token=${token}`);

		expect(response.status).toBe(404);
	});

	it("refuses an attachment token as a bearer token", async () => {
		// Without the guard in requireAuth this would authenticate as a user whose
		// id is an attachment id, and every downstream query would run for them.
		const attachmentToken = signAttachmentToken("some-attachment-id");

		const response = await fetch(`${baseUrl}/users/me`, {
			headers: { Authorization: `Bearer ${attachmentToken}` },
		});

		expect(response.status).toBe(401);
	});
});
