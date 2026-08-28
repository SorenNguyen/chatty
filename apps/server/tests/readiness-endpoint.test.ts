import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
	server = createServer(createApp()).listen(0);
	await once(server, "listening");
	baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
	server.close();
});

describe("liveness and readiness", () => {
	it("answers liveness without touching anything else", async () => {
		// A liveness probe that fails when the database blinks gets the process
		// killed and restarted, which is the one response that cannot help.
		const response = await fetch(`${baseUrl}/health`);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
	});

	it("reports readiness with the checks it actually ran", async () => {
		const response = await fetch(`${baseUrl}/ready`);

		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; checks: Record<string, string> };
		expect(body.ok).toBe(true);
		expect(body.checks.database).toBe("ok");
		// The suite runs without REDIS_URL on purpose — that is the single-instance
		// configuration everything else here is written against — and an optional
		// dependency that is absent must not read as a failure.
		expect(body.checks.redis).toBe("not configured");
	});
});

describe("security headers", () => {
	it("lets another origin display an avatar", async () => {
		// The trap helmet's defaults set: `Cross-Origin-Resource-Policy: same-origin`
		// is right for a server that renders its own pages and wrong for this one.
		// Avatars and attachments are served from here into an <img> on the web
		// app's origin, which differs in every environment. Left at the default,
		// every picture in the product stops loading — and the response is still a
		// perfectly good 200, so nothing that asserts on a body can see it.
		const response = await fetch(`${baseUrl}/health`);

		expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
	});

	it("sets the headers that cost nothing and close real holes", async () => {
		const response = await fetch(`${baseUrl}/health`);

		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("strict-transport-security")).toContain("max-age=");
		// Helmet removes this one rather than setting it: the version of the server
		// is free reconnaissance.
		expect(response.headers.get("x-powered-by")).toBeNull();
	});

	it("does not send a content policy it has no pages to govern", async () => {
		// This is a JSON and image API. A CSP here would govern nothing, while
		// reading as though the web app were covered — which it is not; that
		// belongs in the server that sends the HTML.
		const response = await fetch(`${baseUrl}/health`);

		expect(response.headers.get("content-security-policy")).toBeNull();
	});
});
