import type { LoginRequest, RegisterRequest } from "@chatty/shared-types";
import { z } from "zod";

/**
 * Handles are stored lowercase, so the input is lowercased before the pattern
 * runs — otherwise "Minh" would be rejected rather than accepted as "minh".
 *
 * Requiring a leading letter keeps handles from looking like database ids, and
 * the character set is deliberately narrow: anything that renders differently
 * in different fonts is a way to impersonate someone else's handle.
 */
export const handleSchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(3)
	.max(20)
	.regex(/^[a-z][a-z0-9_]*$/, "Handle must start with a letter and use only letters, numbers and underscores");

export const registerSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
	displayName: z.string().min(1).max(64),
	handle: handleSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Compile-time proof that what these schemas produce is what the client sends.
 *
 * Zod validates at runtime and knows nothing about the client; the shared
 * contract types are what the client is written against. Without this line the
 * two can drift — add a required field to the schema and the frontend keeps
 * compiling while every request 400s.
 */
type AssertAssignable<Actual extends Expected, Expected> = Actual;
export type RegisterContract = AssertAssignable<RegisterInput, RegisterRequest>;
export type LoginContract = AssertAssignable<LoginInput, LoginRequest>;
