import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { logger } from "../src/lib/logger.js";
import { mailer } from "../src/lib/mailer.js";
import { prisma } from "../src/lib/prisma.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
	server = createServer(createApp()).listen(0);
	await once(server, "listening");
	baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
	vi.restoreAllMocks();
});

afterAll(() => {
	server.close();
});

function requestReset(email: string): Promise<Response> {
	return fetch(`${baseUrl}/auth/password-reset`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email }),
	});
}

describe("POST /auth/password-reset", () => {
	it("answers identically for known and unknown addresses", async () => {
		await prisma.user.create({
			data: {
				email: "known@chatty.test",
				handle: "known_test",
				displayName: "Known",
				passwordHash: "not-used-here",
			},
		});
		vi.spyOn(mailer, "send").mockResolvedValue(undefined);

		const [known, unknown] = await Promise.all([
			requestReset("known@chatty.test"),
			requestReset("unknown@chatty.test"),
		]);

		expect([known.status, unknown.status]).toEqual([204, 204]);
		expect([await known.text(), await unknown.text()]).toEqual(["", ""]);
	});

	it("does not turn a mail-provider failure into an account oracle", async () => {
		await prisma.user.create({
			data: {
				email: "known@chatty.test",
				handle: "known_test",
				displayName: "Known",
				passwordHash: "not-used-here",
			},
		});
		vi.spyOn(mailer, "send").mockRejectedValue(new Error("provider unavailable"));
		const logged = vi.spyOn(logger, "error").mockImplementation(() => undefined);

		const response = await requestReset("known@chatty.test");

		expect(response.status).toBe(204);
		expect(await response.text()).toBe("");
		expect(logged).toHaveBeenCalledWith(
			expect.objectContaining({ err: expect.any(Error) }),
			"password reset email delivery failed",
		);
	});

	it("does not wait for a slow mail provider before answering", async () => {
		await prisma.user.create({
			data: {
				email: "known@chatty.test",
				handle: "known_test",
				displayName: "Known",
				passwordHash: "not-used-here",
			},
		});
		let finishDelivery!: () => void;
		const delivery = new Promise<void>((resolve) => {
			finishDelivery = resolve;
		});
		vi.spyOn(mailer, "send").mockReturnValue(delivery);

		const response = await Promise.race([requestReset("known@chatty.test"), delay(1000).then(() => null)]);
		finishDelivery();

		expect(response).not.toBeNull();
		expect(response?.status).toBe(204);
	});

	it("rejects an invalid email before the service runs", async () => {
		const sent = vi.spyOn(mailer, "send").mockResolvedValue(undefined);

		const response = await requestReset("not-an-email");

		expect(response.status).toBe(400);
		expect(sent).not.toHaveBeenCalled();
	});
});
