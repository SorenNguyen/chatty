import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { ConflictError, UnauthorizedError } from "../src/lib/errors.js";
import { prisma } from "../src/lib/prisma.js";
import type { JwtPayload } from "../src/middlewares/require-auth.js";
import { login, register } from "../src/modules/auth/auth.service.js";

const validCredentials = {
	email: "minh@chatty.test",
	password: "SuperSecret123",
	handle: "minh",
	displayName: "Minh",
};

describe("register", () => {
	it("creates the user and returns a token", async () => {
		const result = await register(validCredentials);

		expect(result.user.email).toBe(validCredentials.email);
		expect(result.user.displayName).toBe(validCredentials.displayName);
		expect(result.token).toBeTypeOf("string");
	});

	it("stores the password as a bcrypt hash, never as plaintext", async () => {
		await register(validCredentials);

		const stored = await prisma.user.findUniqueOrThrow({
			where: { email: validCredentials.email },
			select: { passwordHash: true },
		});

		expect(stored.passwordHash).not.toBe(validCredentials.password);
		expect(await bcrypt.compare(validCredentials.password, stored.passwordHash)).toBe(true);
	});

	it("never returns the password hash to the caller", async () => {
		const result = await register(validCredentials);

		expect(result.user).not.toHaveProperty("passwordHash");
	});

	it("issues a token whose `sub` claim is the user id", async () => {
		// requireAuth and the socket handshake both read `sub`. If this contract
		// breaks, every authenticated request fails with a confusing 401.
		const result = await register(validCredentials);
		const payload = jwt.verify(result.token, env.JWT_SECRET) as JwtPayload;

		expect(payload.sub).toBe(result.user.id);
	});

	it("throws ConflictError when the email is already registered", async () => {
		await register(validCredentials);

		await expect(register(validCredentials)).rejects.toBeInstanceOf(ConflictError);
	});

	it("throws ConflictError when the handle is taken by a different email", async () => {
		await register(validCredentials);

		const sameHandle = { ...validCredentials, email: "someone-else@chatty.test" };

		await expect(register(sameHandle)).rejects.toBeInstanceOf(ConflictError);
	});

	it("says which field is taken, so the caller can fix the right one", async () => {
		await register(validCredentials);

		const takenHandle = await register({ ...validCredentials, email: "other@chatty.test" }).catch(
			(error: unknown) => error,
		);
		const takenEmail = await register({ ...validCredentials, handle: "different" }).catch(
			(error: unknown) => error,
		);

		expect((takenHandle as Error).message).toMatch(/handle/i);
		expect((takenEmail as Error).message).toMatch(/email/i);
	});

	it("stores and returns the handle", async () => {
		const result = await register(validCredentials);

		expect(result.user.handle).toBe("minh");
		await expect(prisma.user.findUnique({ where: { handle: "minh" }, select: { email: true } })).resolves.toEqual({
			email: validCredentials.email,
		});
	});
});

describe("login", () => {
	it("returns a token for correct credentials", async () => {
		const registered = await register(validCredentials);

		const result = await login({ email: validCredentials.email, password: validCredentials.password });

		expect(result.user.id).toBe(registered.user.id);
		expect(result.token).toBeTypeOf("string");
	});

	it("throws UnauthorizedError when the password is wrong", async () => {
		await register(validCredentials);

		await expect(login({ email: validCredentials.email, password: "WrongPassword1" })).rejects.toBeInstanceOf(
			UnauthorizedError,
		);
	});

	it("throws the same error for an unknown email as for a wrong password", async () => {
		// Different errors here would let an attacker enumerate which emails have
		// accounts, which is exactly what the identical message is there to prevent.
		await register(validCredentials);

		const wrongPassword = await login({ email: validCredentials.email, password: "WrongPassword1" }).catch(
			(error: unknown) => error,
		);
		const unknownEmail = await login({ email: "nobody@chatty.test", password: "WrongPassword1" }).catch(
			(error: unknown) => error,
		);

		expect(unknownEmail).toBeInstanceOf(UnauthorizedError);
		expect((unknownEmail as Error).message).toBe((wrongPassword as Error).message);
	});

	it("never returns the password hash to the caller", async () => {
		await register(validCredentials);

		const result = await login({ email: validCredentials.email, password: validCredentials.password });

		expect(result.user).not.toHaveProperty("passwordHash");
	});
});
