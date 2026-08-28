import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { logger } from "../src/lib/logger.js";
import { mailer } from "../src/lib/mailer.js";
import { processOutboxOnce } from "../src/lib/outbox.js";
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
		vi.spyOn(logger, "warn").mockImplementation(() => undefined);

		const response = await requestReset("known@chatty.test");
		await processOutboxOnce();

		expect(response.status).toBe(204);
		expect(await response.text()).toBe("");
		// The mail is not lost, which is what the outbox bought: still queued,
		// counted as attempted, with the reason recorded for the next pass. Before
		// the outbox a failure here meant a live token whose owner was never told.
		const queued = await prisma.outboxMessage.findFirstOrThrow({
			select: { status: true, attempts: true, lastError: true },
		});
		expect(queued.status).toBe("PENDING");
		expect(queued.attempts).toBe(1);
		expect(queued.lastError).toContain("provider unavailable");
	});

	it("never touches the mail provider on the request path at all", async () => {
		// Stronger than the timing assertion this replaces. The request used to
		// start delivery and merely decline to await it, so a provider slow enough
		// still competed for this process. Now the request's only mail work is one
		// local INSERT, and the provider is a worker's problem — which is why the
		// spy below must not have been called by the time the 204 comes back.
		await prisma.user.create({
			data: {
				email: "known@chatty.test",
				handle: "known_test",
				displayName: "Known",
				passwordHash: "not-used-here",
			},
		});
		const sent = vi.spyOn(mailer, "send").mockResolvedValue(undefined);

		const response = await requestReset("known@chatty.test");

		expect(response.status).toBe(204);
		expect(sent).not.toHaveBeenCalled();
		expect(await prisma.outboxMessage.count({ where: { status: "PENDING" } })).toBe(1);
	});

	it("rejects an invalid email before the service runs", async () => {
		const sent = vi.spyOn(mailer, "send").mockResolvedValue(undefined);

		const response = await requestReset("not-an-email");

		expect(response.status).toBe(400);
		expect(sent).not.toHaveBeenCalled();
	});
});
