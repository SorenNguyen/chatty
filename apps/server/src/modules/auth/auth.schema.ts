import type {
	ChangePasswordRequest,
	LoginRequest,
	RegisterRequest,
	RequestPasswordResetRequest,
	ResetPasswordRequest,
} from "@chatty/shared-types";
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

/**
 * Trimmed, because a display name is compared by eye and " Minh" reads as
 * "Minh". Declared here rather than inline in `registerSchema` so that editing
 * a profile cannot end up with a different rule than creating one — the same
 * reason `assertParticipant` has one home instead of a copy per module.
 */
export const displayNameSchema = z.string().trim().min(1).max(64);

/**
 * The minimum length, and nothing else. No character-class rules: they push
 * people towards "Password1!" and away from length, which is what actually
 * costs an attacker time. Shared by registration and password change so the
 * bar cannot quietly differ between the two.
 */
export const passwordSchema = z.string().min(8);

export const registerSchema = z.object({
	email: z.string().email(),
	password: passwordSchema,
	displayName: displayNameSchema,
	handle: handleSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * `currentPassword` is only checked for presence. Applying `passwordSchema` to
 * it would reject a valid attempt from anyone who registered before the rule
 * existed — the value's job here is to be compared against a stored hash, not
 * to meet today's bar.
 */
export const changePasswordSchema = z.object({
	currentPassword: z.string().min(1),
	newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const requestPasswordResetSchema = z.object({
	email: z.string().email(),
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

/**
 * The token is only length-checked. Its real validation is whether its hash
 * matches a row, which is a database question rather than a shape one — but a
 * bound belongs here so a megabyte of "token" never reaches the hash function.
 */
export const resetPasswordSchema = z.object({
	token: z.string().min(1).max(512),
	newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

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
export type ChangePasswordContract = AssertAssignable<ChangePasswordInput, ChangePasswordRequest>;
export type RequestPasswordResetContract = AssertAssignable<RequestPasswordResetInput, RequestPasswordResetRequest>;
export type ResetPasswordContract = AssertAssignable<ResetPasswordInput, ResetPasswordRequest>;
