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

const REFRESH_COOKIE = "chatty_refresh_token";

/** The one `Set-Cookie` a response carries, parsed into name/value/attributes. */
function readRefreshCookie(response: Response): { value: string; attributes: string } {
	const cookies = response.headers.getSetCookie();
	const cookie = cookies.find((line) => line.startsWith(`${REFRESH_COOKIE}=`));
	if (!cookie) throw new Error(`no ${REFRESH_COOKIE} cookie in the response`);

	const [assignment, ...attributes] = cookie.split("; ");
	return { value: assignment!.slice(`${REFRESH_COOKIE}=`.length), attributes: attributes.join("; ") };
}

let userCounter = 0;

/** Registers a fresh account and returns the response, so each test starts clean. */
function register(): Promise<Response> {
	userCounter += 1;

	return fetch(`${baseUrl}/auth/register`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email: `user${String(userCounter)}@chatty.test`,
			password: "SuperSecret123",
			handle: `user${String(userCounter)}`,
			displayName: `User ${String(userCounter)}`,
		}),
	});
}

describe("the refresh-token cookie", () => {
	it("returns a client error for malformed JSON instead of reporting a server failure", async () => {
		const response = await fetch(`${baseUrl}/auth/register`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{",
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "BadRequest", message: "Malformed JSON body" });
	});

	it("never appears in a register, login, refresh or password-change response body", async () => {
		const registered = await register();
		const registerBody = (await registered.json()) as Record<string, unknown>;
		expect(registerBody).not.toHaveProperty("refreshToken");
		expect(registerBody).toEqual({ token: expect.any(String), user: expect.any(Object) });

		const { value } = readRefreshCookie(registered);

		const refreshed = await fetch(`${baseUrl}/auth/refresh`, {
			method: "POST",
			headers: { Cookie: `${REFRESH_COOKIE}=${value}` },
		});
		const refreshBody = (await refreshed.json()) as Record<string, unknown>;
		expect(refreshBody).not.toHaveProperty("refreshToken");
		expect(refreshBody).toEqual({ token: expect.any(String) });
	});

	it("is HttpOnly, scoped to /auth, and sent on registration", async () => {
		const registered = await register();

		const { attributes } = readRefreshCookie(registered);
		expect(attributes).toMatch(/HttpOnly/i);
		expect(attributes).toMatch(/Path=\/auth/i);
	});

	it("is the credential /auth/refresh reads — no cookie, no session", async () => {
		const response = await fetch(`${baseUrl}/auth/refresh`, { method: "POST" });

		expect(response.status).toBe(401);
	});

	it("rotates on every refresh, and the spent value stops working", async () => {
		const registered = await register();
		const first = readRefreshCookie(registered).value;

		const refreshed = await fetch(`${baseUrl}/auth/refresh`, {
			method: "POST",
			headers: { Cookie: `${REFRESH_COOKIE}=${first}` },
		});
		const second = readRefreshCookie(refreshed).value;
		expect(second).not.toBe(first);

		const replay = await fetch(`${baseUrl}/auth/refresh`, {
			method: "POST",
			headers: { Cookie: `${REFRESH_COOKIE}=${first}` },
		});
		expect(replay.status).toBe(401);
	});

	it("is cleared by logout, and stops the session it named", async () => {
		const registered = await register();
		const { value } = readRefreshCookie(registered);

		const loggedOut = await fetch(`${baseUrl}/auth/logout`, {
			method: "POST",
			headers: { Cookie: `${REFRESH_COOKIE}=${value}` },
		});
		expect(loggedOut.status).toBe(204);
		const { value: clearedValue, attributes } = readRefreshCookie(loggedOut);
		expect(clearedValue).toBe("");
		expect(attributes).toMatch(/Path=\/auth/i);

		const refreshAfterLogout = await fetch(`${baseUrl}/auth/refresh`, {
			method: "POST",
			headers: { Cookie: `${REFRESH_COOKIE}=${value}` },
		});
		expect(refreshAfterLogout.status).toBe(401);
	});

	it("answers 204 from logout even with no cookie at all", async () => {
		const response = await fetch(`${baseUrl}/auth/logout`, { method: "POST" });

		expect(response.status).toBe(204);
	});
});
