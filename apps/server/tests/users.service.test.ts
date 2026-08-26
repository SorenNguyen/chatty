import { describe, expect, it } from "vitest";
import { NotFoundError } from "../src/lib/errors.js";
import { register } from "../src/modules/auth/auth.service.js";
import { getUserById, searchUsers } from "../src/modules/users/users.service.js";

describe("getUserById", () => {
	it("returns the user's own profile", async () => {
		const { user } = await register({
			email: "minh@chatty.test",
			password: "SuperSecret123",
			handle: "minh",
			displayName: "Minh",
		});

		const profile = await getUserById(user.id);

		expect(profile.id).toBe(user.id);
		expect(profile.email).toBe("minh@chatty.test");
		expect(profile.displayName).toBe("Minh");
		expect(profile.avatarUrl).toBeNull();
	});

	it("serializes createdAt as an ISO string, not a Date", async () => {
		// The wire contract in packages/shared-types says string; returning a Date
		// would typecheck against Prisma's row but break any client parsing it.
		const { user } = await register({
			email: "minh@chatty.test",
			password: "SuperSecret123",
			handle: "minh",
			displayName: "Minh",
		});

		const profile = await getUserById(user.id);

		expect(profile.createdAt).toBeTypeOf("string");
		expect(new Date(profile.createdAt).toISOString()).toBe(profile.createdAt);
	});

	it("never returns the password hash", async () => {
		const { user } = await register({
			email: "minh@chatty.test",
			password: "SuperSecret123",
			handle: "minh",
			displayName: "Minh",
		});

		const profile = await getUserById(user.id);

		expect(profile).not.toHaveProperty("passwordHash");
	});

	it("throws NotFoundError for an id that does not exist", async () => {
		// A Prisma error here would surface as a 500 instead of a 404.
		await expect(getUserById("cuid-that-does-not-exist")).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe("searchUsers", () => {
	async function createUser(name: string, email: string): Promise<string> {
		// Handle derived from the email's local part, suffixed so short names
		// like "an" still clear the 3-character minimum.
		const handle = `${email.split("@")[0]}_test`;
		const { user } = await register({ email, password: "SuperSecret123", handle, displayName: name });

		return user.id;
	}

	it("finds a user by part of their display name, case-insensitively", async () => {
		const minhId = await createUser("Minh", "minh@chatty.test");
		await createUser("An Nguyen", "an@chatty.test");

		const results = await searchUsers(minhId, { query: "nguy", limit: 20 });

		expect(results.map((user) => user.displayName)).toEqual(["An Nguyen"]);
	});

	it("finds a user by their exact email", async () => {
		const minhId = await createUser("Minh", "minh@chatty.test");
		await createUser("An", "an@chatty.test");

		const results = await searchUsers(minhId, { query: "an@chatty.test", limit: 20 });

		expect(results).toHaveLength(1);
		expect(results[0]!.displayName).toBe("An");
	});

	it("finds a user by their handle", async () => {
		const minhId = await createUser("Minh", "minh@chatty.test");
		await createUser("An", "an@chatty.test");

		const results = await searchUsers(minhId, { query: "an_test", limit: 20 });

		expect(results.map((user) => user.handle)).toEqual(["an_test"]);
	});

	it("returns the handle, which is what tells same-named people apart", async () => {
		// Display names are not unique; without the handle these rows are identical.
		const minhId = await createUser("Minh", "minh@chatty.test");
		await createUser("Minh", "minh2@chatty.test");
		await createUser("Minh", "minh3@chatty.test");

		const results = await searchUsers(minhId, { query: "Minh", limit: 20 });

		expect(results).toHaveLength(2);
		expect(new Set(results.map((user) => user.handle)).size).toBe(2);
	});

	it("never returns email addresses, so search cannot be used to harvest them", async () => {
		const minhId = await createUser("Minh", "minh@chatty.test");
		await createUser("An", "an@chatty.test");

		const results = await searchUsers(minhId, { query: "chatty.test", limit: 20 });

		expect(results.length).toBeGreaterThan(0);
		for (const user of results) {
			expect(user).not.toHaveProperty("email");
		}
	});

	it("excludes the caller — you cannot start a conversation with yourself", async () => {
		const minhId = await createUser("Minh", "minh@chatty.test");

		const results = await searchUsers(minhId, { query: "Minh", limit: 20 });

		expect(results).toEqual([]);
	});

	it("respects the limit", async () => {
		const minhId = await createUser("Minh", "minh@chatty.test");
		await createUser("An", "an@chatty.test");
		await createUser("Binh", "binh@chatty.test");

		const results = await searchUsers(minhId, { query: "chatty.test", limit: 1 });

		expect(results).toHaveLength(1);
	});
});
