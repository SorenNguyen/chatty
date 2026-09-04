import { createServer, get, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

interface RawResponse {
	contentEncoding: string | undefined;
	body: Buffer;
}

let server: Server;
let fixtureUrl: string;

beforeAll(async () => {
	const app = createApp();
	// Repetition is intentional: message pages repeat JSON keys, author fields
	// and URL prefixes, which is the real response this fixture stands in for.
	app.get("/__test__/large-json", (_req, res) => {
		res.json({ messages: Array.from({ length: 50 }, () => ({ content: "a repeated conversation message" })) });
	});
	server = createServer(app).listen(0);
	await once(server, "listening");
	fixtureUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/__test__/large-json`;
});

afterAll(() => {
	server.close();
});

function readRaw(acceptEncoding: string): Promise<RawResponse> {
	return new Promise((resolve, reject) => {
		get(fixtureUrl, { headers: { "Accept-Encoding": acceptEncoding } }, (response) => {
			const chunks: Buffer[] = [];
			response.on("data", (chunk: Buffer) => chunks.push(chunk));
			response.on("end", () => {
				resolve({
					contentEncoding: response.headers["content-encoding"],
					body: Buffer.concat(chunks),
				});
			});
		}).on("error", reject);
	});
}

describe("HTTP response compression", () => {
	it("compresses a message-sized JSON response when the client accepts gzip", async () => {
		const [compressed, identity] = await Promise.all([readRaw("gzip"), readRaw("identity")]);

		expect(compressed.contentEncoding).toBe("gzip");
		expect(identity.contentEncoding).toBeUndefined();
		expect(compressed.body.byteLength).toBeLessThan(identity.body.byteLength / 2);
	});
});
