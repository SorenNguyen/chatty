import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";

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

describe("metrics endpoint", () => {
	it("does not expose operational data without the dedicated bearer token", async () => {
		const [missing, wrong, queryString] = await Promise.all([
			fetch(`${baseUrl}/metrics`),
			fetch(`${baseUrl}/metrics`, { headers: { Authorization: "Bearer wrong-token" } }),
			fetch(`${baseUrl}/metrics?token=${env.METRICS_TOKEN}`),
		]);

		expect(missing.status).toBe(401);
		expect(wrong.status).toBe(401);
		expect(queryString.status).toBe(401);
		expect(missing.headers.get("www-authenticate")).toBe("Bearer");
	});

	it("serves bounded application and process metrics to an authorized scraper", async () => {
		await fetch(`${baseUrl}/health`);
		await fetch(`${baseUrl}/conversations/not-a-real-id`);

		const response = await fetch(`${baseUrl}/metrics`, {
			headers: { Authorization: `Bearer ${env.METRICS_TOKEN}` },
		});
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/plain");
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(body).toContain("chatty_http_requests_total");
		expect(body).toContain('route_group="health"');
		expect(body).toContain('route_group="conversations"');
		expect(body).not.toContain("not-a-real-id");
		expect(body).toContain("chatty_process_cpu_user_seconds_total");
	});
});
