/**
 * Kept in step with the Zod rules in
 * apps/server/src/modules/auth/auth.schema.ts. If the server's rules change,
 * change these too — otherwise the form accepts input the API rejects.
 *
 * Shared rather than owned by `features/auth`: registration and profile editing
 * both check a handle, and a cross-feature import is banned precisely so the
 * second copy of a rule cannot drift from the first.
 *
 * The server stays the authority: checking here only saves a round trip, since
 * anything sent from a client can be forged.
 */
export const MIN_PASSWORD_LENGTH = 8;

export const MIN_HANDLE_LENGTH = 3;
export const MAX_HANDLE_LENGTH = 20;

/** Must start with a letter, then letters/digits/underscores only. */
export const HANDLE_PATTERN = /^[a-z][a-z0-9_]*$/;
